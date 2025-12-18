export type HealthReadWindow = { start: Date; end: Date };

export type HealthSample =
  | {
      type: "blood_glucose";
      timestamp: Date;
      data: { mg_dl: number; source: "cgm" | "manual" };
    }
  | {
      type: "heart_rate";
      timestamp: Date;
      data: { bpm: number };
    }
  | {
      type: "blood_pressure";
      timestamp: Date;
      data: { systolic_mmhg: number; diastolic_mmhg: number };
    }
  | {
      type: "steps";
      timestamp: Date;
      data: { spm: number; interval_minutes: number };
    }
  | {
      type: "exercise_minutes";
      timestamp: Date;
      data: { minutes: number };
    }
  | {
      type: "ecg";
      timestamp: Date;
      data: {
        average_bpm?: number;
        classification?: string;
        sampling_hz?: number;
        voltage_samples?: number[][]; // [timeSinceStartSec, voltageV]
      };
    };

export type HealthReadResult = {
  samples: HealthSample[];
  unavailable?: string; // reason message
};

export type ConnectorStatus =
  | { available: true }
  | { available: false; reason: string };
