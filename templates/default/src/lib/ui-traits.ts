import { requireOptionalNativeModule } from "expo-modules-core";
import { createModifier, type ModifierConfig } from "@expo/ui/swift-ui/modifiers";

// upstream expo/expo#47387: merged 2026-07-01 but in no published @expo/ui.
// The Swift half lives in modules/vexpo-ui-traits, registered through the
// public ViewModifierRegistry.register API. Importing this file creates that
// native module, which registers the modifiers before any view renders (the
// optional require keeps a stale dev client from crashing; the modifiers then
// no-op). Delete this file and modules/vexpo-ui-traits once a release ships
// them, then import both from @expo/ui/swift-ui/modifiers.
requireOptionalNativeModule("VexpoUITraits");

export type AccessibilityTrait =
  | "isButton"
  | "isHeader"
  | "isImage"
  | "isSelected"
  | "isLink"
  | "isModal"
  | "isSummaryElement"
  | "updatesFrequently"
  | "startsMediaSession"
  | "allowsDirectInteraction"
  | "causesPageTurn"
  | "isToggle"
  | "playsSound"
  | "isStaticText"
  | "isSearchField"
  | "isKeyboardKey"
  | "isTabBar";

export const accessibilityAddTraits = (traits: AccessibilityTrait[]): ModifierConfig =>
  createModifier("accessibilityAddTraits", { traits });

export const accessibilityRemoveTraits = (traits: AccessibilityTrait[]): ModifierConfig =>
  createModifier("accessibilityRemoveTraits", { traits });
