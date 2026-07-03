/**
 * App Store Connect privacy nutrition label helpers.
 *
 * Apple's public ASC REST API exposes NO privacy resource: the `App`
 * resource has no privacy/data-usage relationship, and the questionnaire
 * is filled only in the App Store Connect dashboard. So there's nothing to
 * fetch; this module is a local lint that validates a declared
 * `app-store/privacy.config.json` against Apple's published enum lists, so a
 * stale or misspelled category gets caught before submission.
 *
 * https://developer.apple.com/app-store/app-privacy-details/
 */

import { isRecord } from "./json.ts";
import type { LintIssue } from "./lint.ts";

export type { LintIssue };

// Apple's published data categories. Source: App Privacy Details guide.
// Strings match the keys ASC uses for `AppPrivacyDataCategory`.
const PRIVACY_DATA_TYPES = [
  "CONTACT_INFO",
  "HEALTH_FITNESS",
  "FINANCIAL_INFO",
  "LOCATION",
  "SENSITIVE_INFO",
  "CONTACTS",
  "USER_CONTENT",
  "BROWSING_HISTORY",
  "SEARCH_HISTORY",
  "IDENTIFIERS",
  "PURCHASES",
  "USAGE_DATA",
  "DIAGNOSTICS",
  "OTHER_DATA",
] as const;
type PrivacyDataType = (typeof PRIVACY_DATA_TYPES)[number];

const PRIVACY_PURPOSES = [
  "THIRD_PARTY_ADVERTISING",
  "DEVELOPER_ADVERTISING",
  "ANALYTICS",
  "PRODUCT_PERSONALIZATION",
  "APP_FUNCTIONALITY",
  "OTHER",
] as const;
type PrivacyPurpose = (typeof PRIVACY_PURPOSES)[number];

export function lintPrivacyConfig(config: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!isRecord(config)) {
    issues.push({ severity: "error", message: "config must be a JSON object" });
    return issues;
  }
  if (typeof config.collectsData !== "boolean") {
    issues.push({ severity: "error", message: "`collectsData` must be a boolean" });
  }
  if (!Array.isArray(config.entries)) {
    issues.push({ severity: "error", message: "`entries` must be an array" });
    return issues;
  }

  if (config.collectsData === false && config.entries.length > 0) {
    issues.push({
      severity: "warning",
      message: "`collectsData` is false but `entries` is non-empty; entries will be ignored.",
    });
  }
  if (config.collectsData === true && config.entries.length === 0) {
    issues.push({
      severity: "error",
      message: "`collectsData` is true but `entries` is empty; declare at least one data type.",
    });
  }

  const seenCategories = new Set<string>();
  config.entries.forEach((raw, index) => {
    if (!isRecord(raw)) {
      issues.push({ severity: "error", message: `entry[${index}] must be an object` });
      return;
    }
    const category = raw.category;
    if (typeof category !== "string" || !PRIVACY_DATA_TYPES.includes(category as PrivacyDataType)) {
      issues.push({
        severity: "error",
        message: `entry[${index}].category '${String(category)}' is not a valid PrivacyDataType. Allowed: ${PRIVACY_DATA_TYPES.join(", ")}`,
      });
    } else if (seenCategories.has(category)) {
      issues.push({
        severity: "warning",
        message: `entry[${index}].category '${category}' is duplicated; only the last entry counts.`,
      });
    } else {
      seenCategories.add(category);
    }
    if (typeof raw.collected !== "boolean") {
      issues.push({ severity: "error", message: `entry[${index}].collected must be a boolean` });
    }
    if (typeof raw.usedForTracking !== "boolean") {
      issues.push({
        severity: "error",
        message: `entry[${index}].usedForTracking must be a boolean`,
      });
    }
    if (typeof raw.linkedToUser !== "boolean") {
      issues.push({
        severity: "error",
        message: `entry[${index}].linkedToUser must be a boolean`,
      });
    }
    if (!Array.isArray(raw.purposes)) {
      issues.push({ severity: "error", message: `entry[${index}].purposes must be an array` });
    } else {
      raw.purposes.forEach((purpose, j) => {
        if (typeof purpose !== "string" || !PRIVACY_PURPOSES.includes(purpose as PrivacyPurpose)) {
          issues.push({
            severity: "error",
            message: `entry[${index}].purposes[${j}] '${String(purpose)}' is not a valid PrivacyPurpose. Allowed: ${PRIVACY_PURPOSES.join(", ")}`,
          });
        }
      });
    }
  });

  return issues;
}
