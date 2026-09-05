import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

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
