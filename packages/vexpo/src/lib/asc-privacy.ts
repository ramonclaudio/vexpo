import { isRecord } from "./json.ts";
import { entriesOf, error, firstSeen, oneOf, warn, type LintIssue } from "./lint.ts";

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
  "SURROUNDINGS",
  "BODY",
  "OTHER_DATA",
] as const;

const PRIVACY_PURPOSES = [
  "THIRD_PARTY_ADVERTISING",
  "DEVELOPER_ADVERTISING",
  "ANALYTICS",
  "PRODUCT_PERSONALIZATION",
  "APP_FUNCTIONALITY",
  "OTHER",
] as const;

export function lintPrivacyConfig(config: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  if (isRecord(config) && typeof config.collectsData !== "boolean") {
    issues.push(error("`collectsData` must be a boolean"));
  }
  const entries = entriesOf(config, issues);
  if (!entries) return issues;
  const collectsData = isRecord(config) ? config.collectsData : undefined;

  if (collectsData === false && entries.length > 0) {
    issues.push(warn("`collectsData` is false but `entries` has items, so Apple ignores them."));
  }
  if (collectsData === true && entries.length === 0) {
    issues.push(
      error("`collectsData` is true but `entries` is empty. Declare at least one data type."),
    );
  }

  const seen = new Set<string>();
  entries.forEach((raw, index) => {
    const at = `entry[${index}]`;
    if (!isRecord(raw)) {
      issues.push(error(`${at} must be an object`));
      return;
    }
    if (oneOf(issues, `${at}.category`, raw.category, PRIVACY_DATA_TYPES, "PrivacyDataType")) {
      firstSeen(seen, issues, `${at}.category`, raw.category as string);
    }
    for (const field of ["collected", "usedForTracking", "linkedToUser"] as const) {
      if (typeof raw[field] !== "boolean") {
        issues.push(error(`${at}.${field} must be a boolean`));
      }
    }
    if (!Array.isArray(raw.purposes)) {
      issues.push(error(`${at}.purposes must be an array`));
      return;
    }
    raw.purposes.forEach((purpose, j) => {
      oneOf(issues, `${at}.purposes[${j}]`, purpose, PRIVACY_PURPOSES, "PrivacyPurpose");
    });
  });

  return issues;
}
