import { useReducedMotion as useSystemReducedMotion } from "react-native-reanimated";

import { useReduceMotionPref } from "@/lib/preferences";

export function useReducedMotion(): boolean {
  const [pref] = useReduceMotionPref();
  const systemOn = useSystemReducedMotion();
  if (pref === "always") return true;
  if (pref === "never") return false;
  return systemOn;
}
