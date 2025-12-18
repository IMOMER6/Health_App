import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ActivityMetric, StorageMode } from "../api/types";

type SettingsState = {
  storageMode: StorageMode;
  activityMetric: ActivityMetric;
  setStorageMode: (m: StorageMode) => void;
  setActivityMetric: (m: ActivityMetric) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      storageMode: "raw",
      activityMetric: "steps_per_min",
      setStorageMode: (m) => set({ storageMode: m }),
      setActivityMetric: (m) => set({ activityMetric: m }),
    }),
    {
      name: "settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
