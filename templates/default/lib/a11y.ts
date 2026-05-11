import { AccessibilityInfo } from "react-native";

export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}
