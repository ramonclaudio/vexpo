import { describe, expect, it } from "vitest";

import { planRowValue } from "../../src/commands/env/push.ts";
import { buildPlan, type EnvSource } from "../../src/lib/env-files.ts";

function entryFor(key: string, value: string, channel: "dev" | "prod" = "dev") {
  const source: EnvSource = {
    path: channel === "prod" ? ".env.prod" : ".env.local",
    channel,
    entries: new Map([[key, value]]),
  };
  const [entry] = buildPlan([source]);
  return entry;
}

describe("planRowValue", () => {
  it("never prints raw convex-routed secret values, even short ones", () => {
    const secret = "fake-resend-key-000000aa"; // 24-char fixture, under shortValue's 60; gitleaks:allow
    const rendered = planRowValue(entryFor("RESEND_API_KEY", secret));
    expect(rendered).not.toContain(secret);
    expect(rendered).toContain("fp:");
    expect(rendered).toContain("24b");
  });

  it("redacts every short convex secret in the routing", () => {
    const secrets = [
      "BETTER_AUTH_SECRET",
      "RESEND_API_KEY",
      "RESEND_WEBHOOK_SECRET",
      "APPLE_CLIENT_SECRET",
    ];
    for (const key of secrets) {
      const value = `${key}-short-value`;
      expect(planRowValue(entryFor(key, value))).not.toContain(value);
    }
  });

  it("shows EXPO_PUBLIC values verbatim (not secret, eas-routed)", () => {
    const url = "https://example.convex.cloud";
    expect(planRowValue(entryFor("EXPO_PUBLIC_CONVEX_URL", url))).toBe(url);
  });
});
