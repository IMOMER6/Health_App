import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

const genId = () => {
  // good enough for an MVP device-scoped id
  return `u_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
};

type UserState = {
  userId: string;
  setUserId: (id: string) => void;
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      userId: get()?.userId || genId(),
      setUserId: (id) => set({ userId: id }),
    }),
    {
      name: "user",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
