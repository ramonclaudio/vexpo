import { describe, expect, it } from "vitest";

import { useTmpCwd } from "../helpers/tmp-cwd.ts";

import { load, recordStep, touchVerifyAt } from "../../src/lib/state";

useTmpCwd("state-refresh-test-");

describe("touchVerifyAt (live-check refresh)", () => {
  it("bumps verifyAt without wiping cached outputs", async () => {
    await recordStep("apple-sign-in", {
      servicesId: "com.example.signin",
      teamId: "ABCDE12345",
      keyId: "KEY67890",
      p8Path: "/keys/AuthKey.p8",
    });
    const before = (await load()).steps["apple-sign-in"];

    await touchVerifyAt("apple-sign-in");

    const after = (await load()).steps["apple-sign-in"];
    expect(after?.outputs).toEqual({
      servicesId: "com.example.signin",
      teamId: "ABCDE12345",
      keyId: "KEY67890",
      p8Path: "/keys/AuthKey.p8",
    });
    expect(new Date(after!.verifyAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before!.verifyAt).getTime(),
    );
    expect(after?.completedAt).toBe(before?.completedAt);
  });

  it("seeds a live-check record when no step exists yet", async () => {
    await touchVerifyAt("resend");
    const rec = (await load()).steps.resend;
    expect(rec?.outputs).toEqual({ source: "live-check" });
    expect(rec?.verifyAt).toBe(rec?.completedAt);
  });
});
