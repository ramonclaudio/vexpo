import { describe, expect, it } from "vitest";

import { isComplete } from "../../src/commands/setup.ts";

// Every key the orchestrator's phase loop visits in default `vexpo full` scope
// (excluding `accounts` and `review-account`, which are opt-in / standalone).
// Pinned here so removing a step from `isComplete`'s required list will fail
// this test before it lands in CI. The original list had 5 entries and silently
// shipped `EAS ↔ ASC link missing` past the "everything is configured" gate
// when apple-asc-link was the only outstanding step.
const REQUIRED_STEPS = [
  "rebrand",
  "convex",
  "better-auth",
  "resend",
  "asc-key",
  "apple-credentials",
  "apple-asc-link",
  "apple-services-id",
  "apple-sign-in",
  "apple-eas-rotation-secrets",
  "eas",
] as const;

const allDone = (): Map<string, boolean> => {
  const m = new Map<string, boolean>();
  for (const k of REQUIRED_STEPS) m.set(k, false);
  return m;
};

describe("isComplete", () => {
  it("returns true when every required step is done and install is fresh", () => {
    expect(isComplete({ needs: allDone(), install: false })).toBe(true);
  });

  it("returns false when node_modules need install", () => {
    expect(isComplete({ needs: allDone(), install: true })).toBe(false);
  });

  for (const step of REQUIRED_STEPS) {
    it(`returns false when only "${step}" is missing`, () => {
      const needs = allDone();
      needs.set(step, true);
      expect(isComplete({ needs, install: false })).toBe(false);
    });
  }

  it("returns true when only an opt-in step is missing (accounts / review-account)", () => {
    // These are not part of default-mode required surface; isComplete should
    // not block on them. Without this, --new flows would never converge.
    const needs = allDone();
    needs.set("accounts", true);
    needs.set("review-account", true);
    expect(isComplete({ needs, install: false })).toBe(true);
  });
});
