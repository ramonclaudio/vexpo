import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  FadeOutUp,
} from "react-native-reanimated";

import { Duration } from "@/constants/ui";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// Built once at module scope, not per render: a layout-animation builder chain
// rebuilt inside a component allocates on every re-render, and the banners
// re-render on every progress tick.
const EASE_OUT = Easing.out(Easing.cubic);

const TOP = {
  entering: FadeInUp.duration(Duration.normal).easing(EASE_OUT),
  exiting: FadeOutUp.duration(Duration.fast).easing(EASE_OUT),
};

const BOTTOM = {
  entering: FadeInDown.duration(Duration.normal).easing(EASE_OUT),
  exiting: FadeOutDown.duration(Duration.fast).easing(EASE_OUT),
};

const REDUCED = {
  entering: FadeIn.duration(Duration.fast),
  exiting: FadeOut.duration(Duration.fast),
};

// A banner enters from the edge it is pinned to and leaves the same way, so the
// motion says where it came from. Exit is shorter than entry: there is nothing
// left to read on the way out. Ease-out on both, never ease-in, so the movement
// is quickest at the start where the eye picks it up.
//
// Reduce Motion drops the travel and keeps a cross-fade. `useReducedMotion`
// merges the system setting with the in-app preference, which is why this does
// not use Reanimated's own `ReduceMotion.System`.
export function useBannerMotion(edge: "top" | "bottom") {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return REDUCED;
  return edge === "top" ? TOP : BOTTOM;
}
