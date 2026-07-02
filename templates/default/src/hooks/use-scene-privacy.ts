import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { redacted } from "@expo/ui/swift-ui/modifiers";

// upstream expo/expo#47269: `redacted("privacy")` redacts only descendants
// marked `privacySensitive()`, so the iOS app-switcher snapshot hides emails,
// session IPs, and identifiers while the rest of the screen stays
// recognizable. AppState flips to "inactive" on applicationWillResignActive,
// before the system takes the snapshot.
export function privacyModifiers(state: AppStateStatus) {
  return state === "active" ? [] : [redacted("privacy")];
}

/**
 * App-switcher privacy shield. Spread the returned modifiers on a screen's
 * `<Host>` (works via the Host modifiers prop, upstream expo/expo#45872) and
 * mark each sensitive leaf with `privacySensitive()`.
 */
export function useScenePrivacy() {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", setState);
    return () => sub.remove();
  }, []);
  return privacyModifiers(state);
}
