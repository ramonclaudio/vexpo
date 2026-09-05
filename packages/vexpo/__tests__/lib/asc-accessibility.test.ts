import { describe, expect, test } from "vitest";

import { lintAccessibilityConfig, planAccessibilityPush } from "../../src/lib/asc-accessibility.ts";

describe("lintAccessibilityConfig", () => {
  test("accepts a clean iPhone config", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "IPHONE", supportsVoiceover: true, supportsCaptions: false }],
    });
    expect(issues).toEqual([]);
  });

  test("ignores the notes field, which is ours and not Apple's", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "IPHONE", notes: "why each one is true" }],
    });
    expect(issues).toEqual([]);
  });

  test("flags unknown device family", () => {
    const issues = lintAccessibilityConfig({ entries: [{ deviceFamily: "SMARTGLASSES" }] });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/not a valid AccessibilityDeviceFamily/);
  });

  test("flags an attribute Apple does not have", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "IPHONE", supportsTelepathicInput: true }],
    });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/not a valid AccessibilityDeclaration attribute/);
  });

  // The old config carried a four-level enum. Apple's model is booleans, so a
  // level string has to fail rather than pass quietly.
  test("flags a support level where a boolean belongs", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "IPHONE", supportsVoiceover: "FULLY_SUPPORTS" }],
    });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/must be true or false/);
  });

  test("flags a feature the device family does not have", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "APPLE_WATCH", supportsVoiceControl: true }],
    });
    const firstError = issues.find((i) => i.severity === "error");
    expect(firstError!.message).toMatch(/APPLE_WATCH has no VoiceControl/);
  });

  test("allows a feature the device family does not have when it is false", () => {
    const issues = lintAccessibilityConfig({
      entries: [{ deviceFamily: "MAC", supportsLargerText: false }],
    });
    expect(issues).toEqual([]);
  });

  test("warns on duplicate device families", () => {
    const issues = lintAccessibilityConfig({
      entries: [
        { deviceFamily: "IPHONE", supportsVoiceover: true },
        { deviceFamily: "IPHONE", supportsVoiceover: false },
      ],
    });
    expect(issues.some((w) => /duplicated/.test(w.message))).toBe(true);
  });

  test("warns on empty entries", () => {
    const issues = lintAccessibilityConfig({ entries: [] });
    const firstWarning = issues.find((i) => i.severity === "warning");
    expect(firstWarning!.message).toMatch(/at least one device family/);
  });
});

describe("planAccessibilityPush", () => {
  const entry = { deviceFamily: "IPHONE" } as const;

  test("creates when the app has no declaration for that family", () => {
    expect(planAccessibilityPush([entry], [])).toEqual([
      { deviceFamily: "IPHONE", action: "create" },
    ]);
  });

  test("updates a draft", () => {
    const remote = [{ id: "abc", attributes: { deviceFamily: "IPHONE", state: "DRAFT" } }];
    expect(planAccessibilityPush([entry], remote)).toEqual([
      { deviceFamily: "IPHONE", action: "update", id: "abc", state: "DRAFT" },
    ]);
  });

  // Apple only accepts PATCH and DELETE while a declaration is a draft, so a
  // published one is reported rather than attempted.
  test("blocks anything that is no longer a draft", () => {
    const remote = [{ id: "abc", attributes: { deviceFamily: "IPHONE", state: "PUBLISHED" } }];
    expect(planAccessibilityPush([entry], remote)[0]!.action).toBe("blocked");
  });

  test("matches on device family, not order", () => {
    const remote = [
      { id: "pad", attributes: { deviceFamily: "IPAD", state: "DRAFT" } },
      { id: "phone", attributes: { deviceFamily: "IPHONE", state: "DRAFT" } },
    ];
    expect(planAccessibilityPush([entry], remote)[0]!.id).toBe("phone");
  });
});
