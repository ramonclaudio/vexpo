import { describe, expect, test } from "vitest";

import { lintPrivacyConfig } from "../../src/lib/asc-privacy.ts";

describe("lintPrivacyConfig", () => {
  test("accepts a clean config", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [
        {
          category: "IDENTIFIERS",
          collected: true,
          usedForTracking: false,
          linkedToUser: true,
          purposes: ["APP_FUNCTIONALITY"],
        },
      ],
    });
    expect(issues).toEqual([]);
  });

  test("flags unknown category", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [
        {
          category: "NOT_A_REAL_CATEGORY",
          collected: true,
          usedForTracking: false,
          linkedToUser: false,
          purposes: ["APP_FUNCTIONALITY"],
        },
      ],
    });
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/not a valid PrivacyDataType/);
  });

  test("flags unknown purpose", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [
        {
          category: "IDENTIFIERS",
          collected: true,
          usedForTracking: false,
          linkedToUser: true,
          purposes: ["NOT_A_PURPOSE"],
        },
      ],
    });
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors[0]!.message).toMatch(/not a valid PrivacyPurpose/);
  });

  test("warns on collectsData=false with entries", () => {
    const issues = lintPrivacyConfig({
      collectsData: false,
      entries: [
        {
          category: "IDENTIFIERS",
          collected: true,
          usedForTracking: false,
          linkedToUser: true,
          purposes: ["APP_FUNCTIONALITY"],
        },
      ],
    });
    const warnings = issues.filter((i) => i.severity === "warning");
    expect(warnings[0]!.message).toMatch(/collectsData.*false.*entries.*non-empty/);
  });

  test("errors when collectsData=true but no entries", () => {
    const issues = lintPrivacyConfig({ collectsData: true, entries: [] });
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors[0]!.message).toMatch(/declare at least one data type/);
  });

  test("warns on duplicate categories", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [
        {
          category: "IDENTIFIERS",
          collected: true,
          usedForTracking: false,
          linkedToUser: true,
          purposes: ["APP_FUNCTIONALITY"],
        },
        {
          category: "IDENTIFIERS",
          collected: true,
          usedForTracking: false,
          linkedToUser: true,
          purposes: ["ANALYTICS"],
        },
      ],
    });
    const warnings = issues.filter((i) => i.severity === "warning");
    expect(warnings.some((w) => /duplicated/.test(w.message))).toBe(true);
  });
});
