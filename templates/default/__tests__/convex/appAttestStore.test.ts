/// <reference types="vite/client" />
/**
 * convexTest coverage for `appAttestStore.consumeChallenge`, the App Attest
 * replay guard. It returns true only the first time a known, unexpired nonce is
 * seen, marking it consumed atomically so a captured nonce can't be replayed.
 * Drop the `row.used` check and a replayed nonce verifies forever.
 */
import { describe, expect, test } from "vitest";

import { internal } from "@/convex/_generated/api";

import { initConvexTest } from "./_harness";

describe("appAttestStore.consumeChallenge", () => {
  test("single-use: first consume succeeds, second fails", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await t.mutation(internal.appAttestStore.createChallenge, {
      nonce: "n1",
      expiresAt: now + 60_000,
    });
    expect(await t.mutation(internal.appAttestStore.consumeChallenge, { nonce: "n1", now })).toBe(
      true,
    );
    expect(await t.mutation(internal.appAttestStore.consumeChallenge, { nonce: "n1", now })).toBe(
      false,
    );
  });

  test("expired challenge is rejected", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await t.mutation(internal.appAttestStore.createChallenge, { nonce: "n2", expiresAt: now - 1 });
    expect(await t.mutation(internal.appAttestStore.consumeChallenge, { nonce: "n2", now })).toBe(
      false,
    );
  });

  test("unknown nonce is rejected", async () => {
    const t = initConvexTest();
    expect(
      await t.mutation(internal.appAttestStore.consumeChallenge, {
        nonce: "never-issued",
        now: Date.now(),
      }),
    ).toBe(false);
  });
});
