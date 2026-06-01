import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function useMotionScreenOptions<A extends string>(
  animation: A,
  animationDuration?: number,
): {
  animation: A | "fade";
  animationDuration: number | undefined;
} {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return { animation: "fade", animationDuration: 150 };
  return { animation, animationDuration };
}
