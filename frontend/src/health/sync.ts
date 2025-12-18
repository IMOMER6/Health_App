import { api } from "../api/client";
import type { IngestSample, StorageMode } from "../api/types";
import type { HealthSample } from "./healthTypes";

function toIngestSamples(samples: HealthSample[]): IngestSample[] {
  return samples.map((s) => {
    const timestamp = s.timestamp.toISOString();

    if (s.type === "blood_glucose") {
      return { type: "blood_glucose", timestamp, data: s.data };
    }
    if (s.type === "heart_rate") {
      return { type: "heart_rate", timestamp, data: s.data };
    }
    if (s.type === "blood_pressure") {
      return { type: "blood_pressure", timestamp, data: s.data };
    }
    if (s.type === "steps") {
      return { type: "steps", timestamp, data: s.data };
    }
    if (s.type === "exercise_minutes") {
      return { type: "exercise_minutes", timestamp, data: s.data };
    }
    return { type: "ecg", timestamp, data: s.data };
  });
}

export async function uploadToBackend(opts: {
  userId: string;
  storageMode: StorageMode;
  samples: HealthSample[];
}) {
  if (opts.storageMode === "local_only") {
    return { uploaded: 0, skipped: opts.samples.length };
  }

  const payload = {
    user_id: opts.userId,
    storage_mode: opts.storageMode,
    samples: toIngestSamples(opts.samples),
  };

  const res = await api.post<{ inserted: number }>("/samples", payload);
  return { uploaded: res.data.inserted, skipped: opts.samples.length - res.data.inserted };
}
