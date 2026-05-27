import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Tracks the iOS `Settings → Accessibility → Display & Text Size → Reduce
 * Transparency` flag. iOS 26 `GlassView` honors the setting natively, but the
 * iOS 16.4-25 `BlurView` fallback in `<Material>` does not, so the surface
 * stays translucent for users who explicitly asked for solid backgrounds.
 *
 * Consults `AccessibilityInfo.isReduceTransparencyEnabled()` on mount and
 * keeps the value live via the `reduceTransparencyChanged` event so a runtime
 * toggle in Settings re-renders consumers without a relaunch.
 */
export function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (!cancelled) setOn(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setOn);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return on;
}
