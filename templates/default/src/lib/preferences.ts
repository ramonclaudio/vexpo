import { createStorage, isBoolean, isOneOf, useStore } from "@/lib/storage";

type ReduceMotionPref = "system" | "always" | "never";

export const hapticsStore = createStorage("pref.hapticsEnabled", true, isBoolean);
const reduceMotionStore = createStorage<ReduceMotionPref>(
  "pref.reduceMotion",
  "system",
  isOneOf("system", "always", "never"),
);

export function useHapticsEnabled(): [boolean, (v: boolean) => void] {
  return [useStore(hapticsStore), hapticsStore.set];
}

export function useReduceMotionPref(): [ReduceMotionPref, (v: ReduceMotionPref) => void] {
  return [useStore(reduceMotionStore), reduceMotionStore.set];
}
