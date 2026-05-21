import { describe, expect, test } from "vitest";

import { lintAccessibilityConfig } from "../../src/lib/asc-accessibility.ts";

describe("lintAccessibilityConfig", () => {
  test("accepts a clean iPhone config", () => {
    const issues = lintAccessibilityConfig({
      entries: [
        {
          deviceFamily: "IPHONE",
          features: { VOICE_OVER: "FULLY_SUPPORTS", LARGER_TEXT: "PARTIAL" },
        },
      ],
    });
    expect(issues).toEqual([]);
  });

  test("flags unknown device family", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "SMARTGLASSES", features: {} }],
    });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/not a valid AccessibilityDeviceFamily/);
  });

  test("flags unknown feature key", () => {
    const issues = lintAccessibilityConfig({
      entries: [
        { deviceFamily: "IPHONE", features: { TELEPATHIC_INPUT: "FULLY_SUPPORTS" as never } },
      ],
    });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/not a valid AccessibilityFeature/);
  });

  test("flags unknown support level", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "IPHONE", features: { VOICE_OVER: "MAYBE" as never } }],
    });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/not a valid AccessibilityLevel/);
  });

  test("warns on duplicate device families", () => {
    const issues = lintAccessibilityConfig({
      entries: [
        { deviceFamily: "IPHONE", features: { VOICE_OVER: "FULLY_SUPPORTS" } },
        { deviceFamily: "IPHONE", features: { VOICE_OVER: "PARTIAL" } },
      ],
    });
    const warnings = issues.filter((i) => i.severity === "warning");
    expect(warnings.some((w) => /duplicated/.test(w.message))).toBe(true);
  });

  test("warns on empty entries", () => {
    const issues = lintAccessibilityConfig({ entries: [] });
    const firstWarning = issues.find((i) => i.severity === "warning");
    expect(firstWarning!.message).toMatch(/at least one device family/);
  });
});
