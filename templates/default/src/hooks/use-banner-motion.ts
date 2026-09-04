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

export function useBannerMotion(edge: "top" | "bottom") {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return REDUCED;
  return edge === "top" ? TOP : BOTTOM;
}
