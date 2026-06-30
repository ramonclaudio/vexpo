import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The EAS build guard in `app.config.ts` runs at module load and throws when a
// build is missing env that would otherwise silently fall back to placeholder
// values. Missing Convex endpoints crash the app on launch; missing identity
// vars ship a binary under the template bundle id / team. This locks in that
// the identity vars are guarded alongside the Convex ones.

const GUARDED = [
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "EXPO_PUBLIC_APP_BUNDLE_ID",
  "EXPO_PUBLIC_APPLE_TEAM_ID",
] as const;

const snapshot = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const key of [...GUARDED, "EAS_BUILD"]) snapshot.set(key, process.env[key]);
});

afterEach(() => {
  for (const [key, value] of snapshot) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  snapshot.clear();
});

const loadConfig = () => import("../../app.config");

describe("EAS build env guard", () => {
  it("imports cleanly when every guarded var is set", async () => {
    process.env.EAS_BUILD = "true";
    for (const key of GUARDED) process.env[key] = "set";
    await expect(loadConfig()).resolves.toBeDefined();
  });

  it("throws naming each missing identity var", async () => {
    process.env.EAS_BUILD = "true";
    process.env.EXPO_PUBLIC_CONVEX_URL = "set";
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "set";
    delete process.env.EXPO_PUBLIC_APP_BUNDLE_ID;
    delete process.env.EXPO_PUBLIC_APPLE_TEAM_ID;
    await expect(loadConfig()).rejects.toThrow(
      /EXPO_PUBLIC_APP_BUNDLE_ID.*EXPO_PUBLIC_APPLE_TEAM_ID/s,
    );
  });

  it("ignores missing vars outside an EAS build", async () => {
    delete process.env.EAS_BUILD;
    for (const key of GUARDED) delete process.env[key];
    await expect(loadConfig()).resolves.toBeDefined();
  });
});
