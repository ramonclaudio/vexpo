import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { load, recordStep, touchVerifyAt } from "../../src/lib/state";

let originalCwd: string;
let workdir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "state-refresh-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("touchVerifyAt (live-check refresh)", () => {
  it("bumps verifyAt without wiping cached outputs", async () => {
    // jwt.ts records the IDs apple jwt --rotate + eas-rotation-secrets read back.
    await recordStep("apple-sign-in", {
      servicesId: "com.example.signin",
      teamId: "ABCDE12345",
      keyId: "KEY67890",
      p8Path: "/keys/AuthKey.p8",
    });
    const before = (await load()).steps["apple-sign-in"];

    // A re-run of `vexpo full` past the 24h TTL whose live-check passes.
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
