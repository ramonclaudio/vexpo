import { describe, expect, test } from "vitest";

import {
  fetchAccessibilityUrl,
  lintAccessibilityConfig,
  planAccessibilityPush,
  setAccessibilityUrl,
} from "../../src/lib/asc-accessibility.ts";

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

describe("planAccessibilityPush states", () => {
  test("blocks a replaced declaration too", () => {
    const remote = [{ id: "abc", attributes: { deviceFamily: "IPHONE", state: "REPLACED" } }];
    const plan = planAccessibilityPush([{ deviceFamily: "IPHONE" }], remote);
    expect(plan[0]!.action).toBe("blocked");
    expect(plan[0]!.state).toBe("REPLACED");
  });
});

type Call = { method: string; path: string; body?: unknown; query?: unknown };

function fakeClient(reply: unknown) {
  const calls: Call[] = [];
  const client = {
    request: (method: string, path: string, body?: unknown, query?: unknown) => {
      calls.push({ method, path, body, query });
      return Promise.resolve(reply);
    },
  };
  return { client: client as never, calls };
}

describe("accessibility URL", () => {
  test("reads it off the app, asking for only that field", async () => {
    const { client, calls } = fakeClient({
      data: { attributes: { accessibilityUrl: "https://example.com/a11y" } },
    });
    await expect(fetchAccessibilityUrl(client, "123")).resolves.toBe("https://example.com/a11y");
    expect(calls[0]).toEqual({
      method: "GET",
      path: "/v1/apps/123",
      body: undefined,
      query: { "fields[apps]": "accessibilityUrl" },
    });
  });

  test("reads an unset URL as null, not undefined", async () => {
    const { client } = fakeClient({ data: { attributes: {} } });
    await expect(fetchAccessibilityUrl(client, "123")).resolves.toBeNull();
  });

  test("patches the app resource", async () => {
    const { client, calls } = fakeClient({});
    await setAccessibilityUrl(client, "123", "https://example.com/a11y");
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.path).toBe("/v1/apps/123");
    expect(calls[0]!.body).toEqual({
      data: {
        type: "apps",
        id: "123",
        attributes: { accessibilityUrl: "https://example.com/a11y" },
      },
    });
  });

  test("clears with null rather than by omission", async () => {
    const { client, calls } = fakeClient({});
    await setAccessibilityUrl(client, "123", null);
    expect(calls[0]!.body).toEqual({
      data: { type: "apps", id: "123", attributes: { accessibilityUrl: null } },
    });
  });
});
