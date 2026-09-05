import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { redacted } from "@expo/ui/swift-ui/modifiers";

export function privacyModifiers(state: AppStateStatus) {
  return state === "active" ? [] : [redacted("privacy")];
}

export function useScenePrivacy() {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", setState);
    return () => sub.remove();
  }, []);
  return privacyModifiers(state);
}
