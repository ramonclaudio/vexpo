import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function useMotionScreenOptions(): {
  animation: "default" | "fade";
  animationDuration?: number;
} {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return { animation: "fade", animationDuration: 150 };
  return { animation: "default" };
}
