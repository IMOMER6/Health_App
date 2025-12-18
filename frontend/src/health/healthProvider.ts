import { Platform } from "react-native";
import type { ConnectorStatus, HealthReadResult, HealthReadWindow } from "./healthTypes";

export async function getConnectorStatus(): Promise<ConnectorStatus> {
  if (Platform.OS === "ios") {
    try {
      const AppleHealthKit = (await import("react-native-health")).default;
      return await new Promise((resolve) => {
        AppleHealthKit.isAvailable((_: any, results: boolean) => {
          if (results) resolve({ available: true });
          else resolve({ available: false, reason: "HealthKit not available" });
        });
      });
    } catch (e: any) {
      return { available: false, reason: e?.message ?? "HealthKit module not available" };
    }
  }

  if (Platform.OS === "android") {
    try {
      const { initialize } = await import("react-native-health-connect");
      const ok = await initialize();
      if (!ok) return { available: false, reason: "Health Connect init failed" };
      return { available: true };
    } catch (e: any) {
      return { available: false, reason: e?.message ?? "Health Connect module not available" };
    }
  }

  return { available: false, reason: "Connectors not available on web" };
}

export async function requestPermissions(): Promise<{ granted: boolean; reason?: string }> {
  if (Platform.OS === "ios") {
    try {
      const AppleHealthKit = (await import("react-native-health")).default;
      const perms = {
        permissions: {
          read: [
            AppleHealthKit.Constants.Permissions.BloodGlucose,
            AppleHealthKit.Constants.Permissions.HeartRate,
            AppleHealthKit.Constants.Permissions.BloodPressureSystolic,
            AppleHealthKit.Constants.Permissions.BloodPressureDiastolic,
            AppleHealthKit.Constants.Permissions.StepCount,
            AppleHealthKit.Constants.Permissions.AppleExerciseTime,
            AppleHealthKit.Constants.Permissions.Electrocardiogram,
          ],
          write: [],
        },
      };

      await new Promise<void>((resolve, reject) => {
        AppleHealthKit.initHealthKit(perms, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return { granted: true };
    } catch (e: any) {
      return { granted: false, reason: e?.message ?? "HealthKit permission failed" };
    }
  }

  if (Platform.OS === "android") {
    try {
      const { requestPermission } = await import("react-native-health-connect");
      const granted = await requestPermission([
        { accessType: "read", recordType: "BloodGlucose" },
        { accessType: "read", recordType: "HeartRate" },
        { accessType: "read", recordType: "BloodPressure" },
        { accessType: "read", recordType: "Steps" },
        { accessType: "read", recordType: "ExerciseSession" },
      ]);

      return { granted: granted.length > 0 };
    } catch (e: any) {
      return { granted: false, reason: e?.message ?? "Health Connect permission failed" };
    }
  }

  return { granted: false, reason: "Unsupported platform" };
}

export async function readLast24h(window: HealthReadWindow): Promise<HealthReadResult> {
  if (Platform.OS === "ios") {
    const AppleHealthKit = (await import("react-native-health")).default;

    const startDate = window.start.toISOString();
    const endDate = window.end.toISOString();

    const opts = { startDate, endDate, limit: 1000, ascending: true };

    const p = <T,>(fn: (cb: (err: any, res: T) => void) => void) =>
      new Promise<T>((resolve, reject) => {
        fn((err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

    const [glucose, hr, bp, stepsDaily, ex, ecg] = await Promise.all([
      p<any[]>((cb) => AppleHealthKit.getBloodGlucoseSamples(opts, cb)),
      p<any[]>((cb) => AppleHealthKit.getHeartRateSamples(opts, cb)),
      p<any[]>((cb) => AppleHealthKit.getBloodPressureSamples(opts, cb)),
      p<any[]>((cb) => AppleHealthKit.getDailyStepCountSamples({ startDate, endDate }, cb)),
      p<any[]>((cb) => AppleHealthKit.getAppleExerciseTime(opts, cb)),
      p<any[]>((cb) => AppleHealthKit.getElectrocardiogramSamples({ ...opts, limit: 3 }, cb)),
    ]);

    // Map + normalize to app schema
    const samples: any[] = [];

    for (const g of glucose ?? []) {
      // value is in unit specified; prefer mg/dL in our backend.
      let mgDl = Number(g.value);
      // If unit is mmol/L, convert.
      if (g?.unit === "mmolPerL" || g?.unit === "mmol/L") {
        mgDl = mgDl * 18.018;
      }
      samples.push({
        type: "blood_glucose",
        timestamp: new Date(g.startDate),
        data: {
          mg_dl: mgDl,
          source: g?.metadata?.HKWasUserEntered ? "manual" : "cgm",
        },
      });
    }

    for (const h of hr ?? []) {
      samples.push({
        type: "heart_rate",
        timestamp: new Date(h.startDate),
        data: { bpm: Number(h.value) },
      });
    }

    for (const b of bp ?? []) {
      samples.push({
        type: "blood_pressure",
        timestamp: new Date(b.startDate),
        data: {
          systolic_mmhg: Number(b.bloodPressureSystolicValue),
          diastolic_mmhg: Number(b.bloodPressureDiastolicValue),
        },
      });
    }

    // HealthKit only gives daily buckets easily; map to interval_minutes=1440 (dashboard still works).
    for (const s of stepsDaily ?? []) {
      samples.push({
        type: "steps",
        timestamp: new Date(s.startDate),
        data: {
          spm: Number(s.value) / (24 * 60),
          interval_minutes: 24 * 60,
        },
      });
    }

    for (const m of ex ?? []) {
      samples.push({
        type: "exercise_minutes",
        timestamp: new Date(m.startDate),
        data: { minutes: Number(m.value) },
      });
    }

    for (const e of ecg ?? []) {
      samples.push({
        type: "ecg",
        timestamp: new Date(e.startDate),
        data: {
          average_bpm: e.averageHeartRate,
          classification: e.classification,
          sampling_hz: e.samplingFrequency,
          voltage_samples: e.voltageMeasurements,
        },
      });
    }

    return { samples };
  }

  if (Platform.OS === "android") {
    const { readRecords } = await import("react-native-health-connect");

    const startTime = window.start.toISOString();
    const endTime = window.end.toISOString();

    const timeRangeFilter = { operator: "between", startTime, endTime } as const;

    const [glucoseRes, hrRes, bpRes, stepsRes, exerciseRes] = await Promise.all([
      readRecords("BloodGlucose", { timeRangeFilter }),
      readRecords("HeartRate", { timeRangeFilter }),
      readRecords("BloodPressure", { timeRangeFilter }),
      readRecords("Steps", { timeRangeFilter }),
      readRecords("ExerciseSession", { timeRangeFilter }),
    ]);

    const glucose = ((glucoseRes as unknown as any)?.records ?? []) as any[];
    const hr = ((hrRes as unknown as any)?.records ?? []) as any[];
    const bp = ((bpRes as unknown as any)?.records ?? []) as any[];
    const steps = ((stepsRes as unknown as any)?.records ?? []) as any[];
    const exercise = ((exerciseRes as unknown as any)?.records ?? []) as any[];

    const samples: any[] = [];

    for (const g of glucose) {
      const mgDl = g.level?.inMgPerDl ?? (g.level?.inMmolPerL ? g.level.inMmolPerL * 18.018 : undefined);
      if (mgDl != null) {
        samples.push({
          type: "blood_glucose",
          timestamp: new Date(g.time),
          data: { mg_dl: Number(mgDl), source: g.metadata?.dataOrigin ? "cgm" : "manual" },
        });
      }
    }

    for (const h of (hr as any[] | undefined) ?? []) {
      // HeartRate in Health Connect can have samples array; fallback to bpm
      const bpm = h.beatsPerMinute ?? (h.samples?.[0]?.beatsPerMinute ?? undefined);
      if (bpm != null) {
        samples.push({ type: "heart_rate", timestamp: new Date(h.time), data: { bpm: Number(bpm) } });
      }
    }

    for (const b of (bp as any[] | undefined) ?? []) {
      const systolic = b.systolic?.inMillimetersOfMercury;
      const diastolic = b.diastolic?.inMillimetersOfMercury;
      if (systolic != null && diastolic != null) {
        samples.push({
          type: "blood_pressure",
          timestamp: new Date(b.time),
          data: { systolic_mmhg: Number(systolic), diastolic_mmhg: Number(diastolic) },
        });
      }
    }

    for (const s of (steps as any[] | undefined) ?? []) {
      // Steps record is an interval [startTime,endTime] with count
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const minutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
      samples.push({
        type: "steps",
        timestamp: start,
        data: { spm: Number(s.count) / minutes, interval_minutes: minutes },
      });
    }

    for (const ex of (exercise as any[] | undefined) ?? []) {
      const start = new Date(ex.startTime);
      const end = new Date(ex.endTime);
      const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      samples.push({
        type: "exercise_minutes",
        timestamp: start,
        data: { minutes },
      });
    }

    return { samples };
  }

  return { samples: [], unavailable: "Unsupported platform" };
}
