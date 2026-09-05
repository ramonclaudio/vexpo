import { describe, expect, test } from "vitest";

import { lintPrivacyConfig } from "../../src/lib/asc-privacy.ts";

// One valid entry; every case varies the field it is about.
const entry = (overrides: Record<string, unknown> = {}) => ({
  category: "IDENTIFIERS",
  collected: true,
  usedForTracking: false,
  linkedToUser: true,
  purposes: ["APP_FUNCTIONALITY"],
  ...overrides,
});

const firstOfSeverity = (issues: { severity: string; message: string }[], severity: string) =>
  issues.find((i) => i.severity === severity);

describe("lintPrivacyConfig", () => {
  test("accepts a clean config", () => {
    expect(lintPrivacyConfig({ collectsData: true, entries: [entry()] })).toEqual([]);
  });

  test("flags unknown category", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [entry({ category: "NOT_A_REAL_CATEGORY", linkedToUser: false })],
    });
    const error = firstOfSeverity(issues, "error");
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/not a valid PrivacyDataType/);
  });

  test("flags unknown purpose", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [entry({ purposes: ["NOT_A_PURPOSE"] })],
    });
    expect(firstOfSeverity(issues, "error")!.message).toMatch(/not a valid PrivacyPurpose/);
  });

  test("warns on collectsData=false with entries", () => {
    const issues = lintPrivacyConfig({ collectsData: false, entries: [entry()] });
    expect(firstOfSeverity(issues, "warning")!.message).toMatch(
      /collectsData.*false.*entries.*non-empty/,
    );
  });

  test("errors when collectsData=true but no entries", () => {
    const issues = lintPrivacyConfig({ collectsData: true, entries: [] });
    expect(firstOfSeverity(issues, "error")!.message).toMatch(/declare at least one data type/);
  });

  test("warns on duplicate categories", () => {
    const issues = lintPrivacyConfig({
      collectsData: true,
      entries: [entry(), entry({ purposes: ["ANALYTICS"] })],
    });
    const warnings = issues.filter((i) => i.severity === "warning");
    expect(warnings.some((w) => /duplicated/.test(w.message))).toBe(true);
  });
});
