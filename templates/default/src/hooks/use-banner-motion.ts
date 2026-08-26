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

  if (reduceMotion) {
    return {
      entering: FadeIn.duration(Duration.fast),
      exiting: FadeOut.duration(Duration.fast),
    };
  }

  const ease = Easing.out(Easing.cubic);
  const [enter, exit] = edge === "top" ? [FadeInUp, FadeOutUp] : [FadeInDown, FadeOutDown];

  return {
    entering: enter.duration(Duration.normal).easing(ease),
    exiting: exit.duration(Duration.fast).easing(ease),
  };
}
