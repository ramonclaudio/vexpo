import { useSyncExternalStore } from "react";

import { createStorage } from "@/lib/storage";

export type ReduceMotionPref = "system" | "always" | "never";

const hapticsStore = createStorage<boolean>("pref.hapticsEnabled", true);
const reduceMotionStore = createStorage<ReduceMotionPref>("pref.reduceMotion", "system");
const debugEnabledStore = createStorage<boolean>("pref.debugEnabled", __DEV__);
const analyticsStore = createStorage<boolean>("pref.shareAnalytics", true);

export const preferences = {
  hapticsEnabled: () => hapticsStore.get(),
  setHapticsEnabled: (v: boolean) => hapticsStore.set(v),

  reduceMotion: () => reduceMotionStore.get(),
  setReduceMotion: (v: ReduceMotionPref) => reduceMotionStore.set(v),

  debugEnabled: () => debugEnabledStore.get(),
  setDebugEnabled: (v: boolean) => debugEnabledStore.set(v),

  shareAnalytics: () => analyticsStore.get(),
  setShareAnalytics: (v: boolean) => analyticsStore.set(v),
};

export function useHapticsEnabled(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(hapticsStore.subscribe, hapticsStore.get, hapticsStore.get);
  return [v, hapticsStore.set];
}

export function useReduceMotionPref(): [ReduceMotionPref, (v: ReduceMotionPref) => void] {
  const v = useSyncExternalStore(
    reduceMotionStore.subscribe,
    reduceMotionStore.get,
    reduceMotionStore.get,
  );
  return [v, reduceMotionStore.set];
}

export function useDebugEnabled(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    debugEnabledStore.subscribe,
    debugEnabledStore.get,
    debugEnabledStore.get,
  );
  return [v, debugEnabledStore.set];
}

export function useShareAnalytics(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(analyticsStore.subscribe, analyticsStore.get, analyticsStore.get);
  return [v, analyticsStore.set];
}
