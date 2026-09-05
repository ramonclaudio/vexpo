import type { AscClient } from "./asc-api.ts";
import { isRecord } from "./json.ts";
import { entriesOf, error, firstSeen, oneOf, warn, type LintIssue } from "./lint.ts";

export type { LintIssue };

const ACCESSIBILITY_FEATURES = [
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

const ACCESSIBILITY_LEVELS = [
  "FULLY_SUPPORTS",
  "PARTIAL",
  "DOES_NOT_SUPPORT",
  "NOT_APPLICABLE",
] as const;

const ACCESSIBILITY_DEVICE_FAMILIES = [
  "IPHONE",
  "IPAD",
  "MAC",
  "APPLE_TV",
  "APPLE_WATCH",
  "VISION",
] as const;

export function lintAccessibilityConfig(config: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  const entries = entriesOf(config, issues);
  if (!entries) return issues;
  if (entries.length === 0) {
    issues.push(warn("`entries` is empty; declare at least one device family."));
  }

  const seen = new Set<string>();
  entries.forEach((raw, index) => {
    const at = `entry[${index}]`;
    if (!isRecord(raw)) {
      issues.push(error(`${at} must be an object`));
      return;
    }
    const family = raw.deviceFamily;
    const familyAt = `${at}.deviceFamily`;
    if (
      oneOf(issues, familyAt, family, ACCESSIBILITY_DEVICE_FAMILIES, "AccessibilityDeviceFamily")
    ) {
      firstSeen(seen, issues, familyAt, family as string);
    }
    if (!isRecord(raw.features)) {
      issues.push(error(`${at}.features must be an object`));
      return;
    }
    for (const [feature, level] of Object.entries(raw.features)) {
      const featureAt = `${at}.features['${feature}']`;
      // The key is the value here, so the message names it rather than quoting
      // it after, which is why this one check does not go through `oneOf`.
      if (!ACCESSIBILITY_FEATURES.includes(feature as (typeof ACCESSIBILITY_FEATURES)[number])) {
        issues.push(
          error(
            `${featureAt} is not a valid AccessibilityFeature. Allowed: ${ACCESSIBILITY_FEATURES.join(", ")}`,
          ),
        );
      }
      oneOf(issues, `${featureAt} level`, level, ACCESSIBILITY_LEVELS, "AccessibilityLevel");
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
