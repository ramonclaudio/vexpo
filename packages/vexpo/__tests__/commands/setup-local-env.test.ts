import { describe, expect, it } from "vitest";

import { classifyLocalEnv } from "../../src/commands/setup.ts";

// The lite core is everything `vexpo lite` writes. EXPO_PUBLIC_APPLE_TEAM_ID is
// optional after lite (convex.ts treats it as such), so it sits outside the
// core and only flips "partial" to "ok".
const LITE_CORE = [
  "CONVEX_DEPLOYMENT",
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "EXPO_PUBLIC_SITE_URL",
  "EXPO_PUBLIC_APP_BUNDLE_ID",
] as const;

const envOf = (keys: readonly string[]): Map<string, string> => new Map(keys.map((k) => [k, "x"]));

describe("classifyLocalEnv", () => {
  it("returns ok when the full core plus team id is present", () => {
    expect(classifyLocalEnv(envOf([...LITE_CORE, "EXPO_PUBLIC_APPLE_TEAM_ID"]))).toBe("ok");
  });

  it("returns partial when the lite core is present but team id is missing", () => {
    expect(classifyLocalEnv(envOf(LITE_CORE))).toBe("partial");
  });

  it("returns missing when any lite-core key is absent", () => {
    for (const drop of LITE_CORE) {
      const keys = LITE_CORE.filter((k) => k !== drop);
      expect(classifyLocalEnv(envOf(keys))).toBe("missing");
      // team id alone never rescues an incomplete core
      expect(classifyLocalEnv(envOf([...keys, "EXPO_PUBLIC_APPLE_TEAM_ID"]))).toBe("missing");
    }
  });

  it("returns missing for an empty env", () => {
    expect(classifyLocalEnv(new Map())).toBe("missing");
  });

  it("ignores unrelated keys", () => {
    expect(classifyLocalEnv(envOf([...LITE_CORE, "RESEND_API_KEY", "APPLE_KEY_ID"]))).toBe(
      "partial",
    );
  });
});
