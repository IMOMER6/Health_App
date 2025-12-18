from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
import uuid
from datetime import datetime, timedelta, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


# =============================
# Phase 1: Vital Metrics models
# =============================

MetricType = Literal[
    "blood_glucose",
    "heart_rate",
    "blood_pressure",
    "steps",
    "exercise_minutes",
    "ecg",
]

StorageMode = Literal["raw", "aggregated", "local_only"]


class SampleIn(BaseModel):
    type: MetricType
    timestamp: datetime
    end_time: Optional[datetime] = None
    data: Dict[str, Any]


class SamplesIngestRequest(BaseModel):
    user_id: str
    storage_mode: StorageMode = "raw"
    samples: List[SampleIn]


class SamplesIngestResponse(BaseModel):
    inserted: int


class CorrelationEvent(BaseModel):
    spike: Dict[str, Any]
    activity_dip: Dict[str, Any]


class Dashboard24hResponse(BaseModel):
    window: Dict[str, str]
    series: Dict[str, Any]
    correlations: List[CorrelationEvent]


def _dt_to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _ensure_tz(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _get_user_window_24h(user_id: str) -> tuple[datetime, datetime]:
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=24)
    return start, end


async def _fetch_samples_raw(user_id: str, start: datetime, end: datetime) -> List[Dict[str, Any]]:
    cursor = db.health_samples_raw.find(
        {
            "user_id": user_id,
            "timestamp": {"$gte": start, "$lte": end},
        },
        {"_id": 0},
    ).sort("timestamp", 1)
    return await cursor.to_list(length=100000)


def _rolling_steps_dip_windows(
    steps_points: List[Dict[str, Any]],
    start: datetime,
    end: datetime,
    window_minutes: int = 20,
    steps_threshold: int = 100,
) -> List[Dict[str, Any]]:
    """Detect continuous inactivity windows where total steps in the last window_minutes < threshold.

    We assume steps_points are sorted ascending and represent per-minute counts (or any small interval).
    """

    if not steps_points:
        return []

    # Normalize to per-minute buckets based on timestamp minute.
    buckets: Dict[datetime, int] = {}
    for p in steps_points:
        t = _ensure_tz(p["timestamp"])
        t_min = t.replace(second=0, microsecond=0)
        v = int(p.get("spm") or p.get("steps") or 0)
        buckets[t_min] = buckets.get(t_min, 0) + v

    # Create full minute timeline
    timeline: List[datetime] = []
    cur = start.replace(second=0, microsecond=0)
    end_min = end.replace(second=0, microsecond=0)
    while cur <= end_min:
        timeline.append(cur)
        cur = cur + timedelta(minutes=1)

    values = [buckets.get(t, 0) for t in timeline]

    dips: List[Dict[str, Any]] = []
    w = window_minutes
    rolling = sum(values[:w])
    for i in range(w - 1, len(values)):
        if i >= w:
            rolling += values[i] - values[i - w]
        win_end = timeline[i]
        win_start = win_end - timedelta(minutes=w)
        if rolling < steps_threshold:
            dips.append(
                {
                    "start": win_start,
                    "end": win_end,
                    "steps": int(rolling),
                    "reason": f"steps_below_{steps_threshold}_per_{window_minutes}m",
                }
            )

    # De-duplicate consecutive windows into merged intervals
    merged: List[Dict[str, Any]] = []
    for d in dips:
        if not merged:
            merged.append(d)
            continue
        last = merged[-1]
        if d["start"] <= last["end"] + timedelta(minutes=1):
            last["end"] = max(last["end"], d["end"])
            last["steps"] = min(last["steps"], d["steps"])  # keep worst
        else:
            merged.append(d)
    return merged


def _detect_glucose_spikes(
    glucose_points: List[Dict[str, Any]],
    delta_mg_dl: int = 30,
    timeframe_minutes: int = 60,
) -> List[Dict[str, Any]]:
    """Detect spikes: rise by >= delta within timeframe.

    Returns spike windows with baseline/start, peak and delta.
    """

    if len(glucose_points) < 2:
        return []

    spikes: List[Dict[str, Any]] = []
    points = [
        {
            "t": _ensure_tz(p["timestamp"]),
            "mg_dl": float(p.get("mg_dl") or p.get("value") or 0),
            "source": p.get("source"),
        }
        for p in glucose_points
        if (p.get("mg_dl") is not None or p.get("value") is not None)
    ]
    points.sort(key=lambda x: x["t"])

    tf = timedelta(minutes=timeframe_minutes)

    # Simple O(n^2) for 24h small N; can optimize later.
    for i in range(len(points) - 1):
        base = points[i]
        peak = base
        for j in range(i + 1, len(points)):
            cur = points[j]
            if cur["t"] - base["t"] > tf:
                break
            if cur["mg_dl"] > peak["mg_dl"]:
                peak = cur
        if peak["mg_dl"] - base["mg_dl"] >= delta_mg_dl and peak != base:
            spikes.append(
                {
                    "start": base["t"],
                    "end": peak["t"],
                    "baseline_mg_dl": base["mg_dl"],
                    "peak_mg_dl": peak["mg_dl"],
                    "delta_mg_dl": peak["mg_dl"] - base["mg_dl"],
                }
            )

    # Merge spikes that start within the previous spike window
    merged: List[Dict[str, Any]] = []
    for s in spikes:
        if not merged:
            merged.append(s)
            continue
        last = merged[-1]
        if s["start"] <= last["end"]:
            last["end"] = max(last["end"], s["end"])
            last["peak_mg_dl"] = max(last["peak_mg_dl"], s["peak_mg_dl"])
            last["delta_mg_dl"] = max(last["delta_mg_dl"], s["delta_mg_dl"])
        else:
            merged.append(s)

    return merged


def _correlate_spike_with_dip(
    spikes: List[Dict[str, Any]],
    dips: List[Dict[str, Any]],
) -> List[CorrelationEvent]:
    events: List[CorrelationEvent] = []
    for s in spikes:
        s_start = _ensure_tz(s["start"])
        s_window_end = s_start + timedelta(minutes=60)
        for d in dips:
            d_start = _ensure_tz(d["start"])
            d_end = _ensure_tz(d["end"])
            # overlap: dip overlaps spike window [s_start, s_start+60m]
            if d_end >= s_start and d_start <= s_window_end:
                events.append(
                    CorrelationEvent(
                        spike={
                            "start": _dt_to_iso(s_start),
                            "end": _dt_to_iso(_ensure_tz(s["end"])),
                            "delta_mg_dl": round(float(s["delta_mg_dl"]), 1),
                            "baseline_mg_dl": round(float(s["baseline_mg_dl"]), 1),
                            "peak_mg_dl": round(float(s["peak_mg_dl"]), 1),
                        },
                        activity_dip={
                            "start": _dt_to_iso(d_start),
                            "end": _dt_to_iso(d_end),
                            "reason": d.get("reason"),
                            "steps": d.get("steps"),
                        },
                    )
                )
                break
    return events

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
