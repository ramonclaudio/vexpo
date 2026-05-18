/**
 * App Store Connect Accessibility Nutrition Labels helpers.
 *
 * Apple launched Accessibility Nutrition Labels at WWDC25 (iOS / iPadOS /
 * macOS / tvOS / visionOS / watchOS 26+). Voluntary at launch, trending
 * mandatory for new submissions over the next year.
 *
 * This module covers read (`fetchAccessibilityDeclarations`) and local
 * lint (`lintAccessibilityConfig`). The write endpoints exist in the
 * App Store Connect API surface but the schema is still in flux; push
 * is left to the operator via the dashboard until the API stabilizes.
 *
 * https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/
 */

import type { AscClient } from "./asc-api.ts";

// Apple's supported features in the Accessibility Nutrition Labels surface.
export const ACCESSIBILITY_FEATURES = [
  "VOICE_OVER",
  "VOICE_CONTROL",
  "LARGER_TEXT",
  "DARK_INTERFACE",
  "SUFFICIENT_CONTRAST",
  "DIFFERENTIATION_WITHOUT_COLOR_ALONE",
  "REDUCED_MOTION",
  "CAPTIONS",
  "AUDIO_DESCRIPTIONS",
] as const;
export type AccessibilityFeature = (typeof ACCESSIBILITY_FEATURES)[number];

// Per-feature support level. Apple's UI lets developers declare "Yes"
// (fully supports), "No" (does not support), or "N/A" (feature doesn't
// apply to the app's content). "PARTIAL" is included for the schema
// even though the dashboard collapses it into "Yes" with a caveat note.
export const ACCESSIBILITY_LEVELS = [
  "FULLY_SUPPORTS",
  "PARTIAL",
  "DOES_NOT_SUPPORT",
  "NOT_APPLICABLE",
] as const;
export type AccessibilityLevel = (typeof ACCESSIBILITY_LEVELS)[number];

// Device families Apple breaks the declaration by. Most apps declare per
// device family; visionOS in particular requires its own declaration.
export const ACCESSIBILITY_DEVICE_FAMILIES = [
  "IPHONE",
  "IPAD",
  "MAC",
  "APPLE_TV",
  "APPLE_WATCH",
  "VISION",
] as const;
export type AccessibilityDeviceFamily = (typeof ACCESSIBILITY_DEVICE_FAMILIES)[number];

export type AccessibilityEntry = {
  deviceFamily: AccessibilityDeviceFamily;
  features: Partial<Record<AccessibilityFeature, AccessibilityLevel>>;
  notes?: string;
};

export type AccessibilityConfig = {
  $schema?: string;
  entries: AccessibilityEntry[];
};

export type AccessibilityLintIssue = { severity: "error" | "warning"; message: string };

export function lintAccessibilityConfig(config: unknown): AccessibilityLintIssue[] {
  const issues: AccessibilityLintIssue[] = [];
  if (!isRecord(config)) {
    issues.push({ severity: "error", message: "config must be a JSON object" });
    return issues;
  }
  if (!Array.isArray(config.entries)) {
    issues.push({ severity: "error", message: "`entries` must be an array" });
    return issues;
  }
  if (config.entries.length === 0) {
    issues.push({
      severity: "warning",
      message: "`entries` is empty; declare at least one device family.",
    });
  }

  const seen = new Set<string>();
  config.entries.forEach((raw, index) => {
    if (!isRecord(raw)) {
      issues.push({ severity: "error", message: `entry[${index}] must be an object` });
      return;
    }
    const family = raw.deviceFamily;
    if (
      typeof family !== "string" ||
      !ACCESSIBILITY_DEVICE_FAMILIES.includes(family as AccessibilityDeviceFamily)
    ) {
      issues.push({
        severity: "error",
        message: `entry[${index}].deviceFamily '${String(family)}' is not a valid AccessibilityDeviceFamily. Allowed: ${ACCESSIBILITY_DEVICE_FAMILIES.join(", ")}`,
      });
    } else if (seen.has(family)) {
      issues.push({
        severity: "warning",
        message: `entry[${index}].deviceFamily '${family}' is duplicated; only the last entry counts.`,
      });
    } else {
      seen.add(family);
    }
    if (!isRecord(raw.features)) {
      issues.push({ severity: "error", message: `entry[${index}].features must be an object` });
      return;
    }
    for (const [feature, level] of Object.entries(raw.features)) {
      if (!ACCESSIBILITY_FEATURES.includes(feature as AccessibilityFeature)) {
        issues.push({
          severity: "error",
          message: `entry[${index}].features['${feature}'] is not a valid AccessibilityFeature. Allowed: ${ACCESSIBILITY_FEATURES.join(", ")}`,
        });
      }
      if (
        typeof level !== "string" ||
        !ACCESSIBILITY_LEVELS.includes(level as AccessibilityLevel)
      ) {
        issues.push({
          severity: "error",
          message: `entry[${index}].features['${feature}'] level '${String(level)}' is not a valid AccessibilityLevel. Allowed: ${ACCESSIBILITY_LEVELS.join(", ")}`,
        });
      }
    }
  });

  return issues;
}

export async function fetchAccessibilityDeclarations(
  client: AscClient,
  appId: string,
): Promise<unknown> {
  return client.request("GET", `/v1/apps/${appId}/accessibilityDeclarations`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
