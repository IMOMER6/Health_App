export type StorageMode = "raw" | "aggregated" | "local_only";
export type ActivityMetric = "steps_per_min" | "exercise_minutes";

export type SampleType =
  | "blood_glucose"
  | "heart_rate"
  | "blood_pressure"
  | "steps"
  | "exercise_minutes"
  | "ecg";

export type IngestSample = {
  type: SampleType;
  timestamp: string; // ISO
  end_time?: string;
  data: Record<string, unknown>;
};

export type DashboardSeries = {
  blood_glucose: { t: string; mg_dl: number; source?: string }[];
  heart_rate: { t: string; bpm: number }[];
  blood_pressure: { t: string; systolic_mmhg: number; diastolic_mmhg: number }[];
  steps_per_min: { t: string; spm: number }[];
  exercise_minutes: { t: string; minutes: number }[];
  ecg: { t: string; average_bpm?: number; classification?: string }[];
};

export type CorrelationEvent = {
  spike: {
    start: string;
    end: string;
    delta_mg_dl: number;
    baseline_mg_dl: number;
    peak_mg_dl: number;
  };
  activity_dip: {
    start: string;
    end: string;
    reason?: string;
    steps?: number;
  };
};

export type Dashboard24hResponse = {
  window: { start: string; end: string };
  series: DashboardSeries;
  correlations: CorrelationEvent[];
};
