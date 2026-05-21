import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Stack `screenOptions.animation` + `animationDuration` that fall back to a
 * fast cross-fade when the OS Reduce Motion setting is on. Pass the desired
 * animation and (optional) duration for the normal case. The reduced
 * fallback is fixed at `fade` / 150ms.
 *
 * Per-screen overrides (`<Stack.Screen options={{ animation: "none" }} />`)
 * still take precedence over the layout default; this hook only sets the
 * Stack-level default.
 */
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
