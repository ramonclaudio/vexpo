/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";

import { initConvexTest } from "./_harness";

const AT = "2026-09-02T00:00:00.000Z";

const base = {
  created_at: AT,
  email_id: "email_123",
  from: "vexpo@example.com",
  to: "someone@example.com",
  subject: "Your sign-in code",
};

const event = (type: string, extra: Record<string, unknown> = {}) =>
  ({
    id: "email_123",
    event: { type, created_at: AT, data: { ...base, ...extra } },
  }) as never;

const ACTIONABLE = [
  ["email.bounced", { bounce: { type: "Permanent", subType: "General", message: "no such user" } }],
  ["email.complained", {}],
  ["email.failed", { failed: { reason: "rejected by the receiving server" } }],
] as const;

const QUIET = [
  ["email.sent", {}],
  ["email.delivered", {}],
  ["email.opened", { open: { ipAddress: "1.2.3.4", timestamp: AT, userAgent: "Mail/1.0" } }],
] as const;

describe("email.handleEmailEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  test.each(ACTIONABLE)("warns on %s", async (type, extra) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = initConvexTest();

    expect(await t.mutation(internal.email.handleEmailEvent, event(type, extra))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(type);
  });

  test.each(QUIET)("stays quiet on %s", async (type, extra) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = initConvexTest();

    expect(await t.mutation(internal.email.handleEmailEvent, event(type, extra))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test("the args validator rejects an event type the component does not define", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(internal.email.handleEmailEvent, event("email.suppressed")),
    ).rejects.toThrow(/Validator error/);
  });
});

describe("crons.cleanupResend", () => {
  test("schedules both component sweeps and they run clean", async () => {
    const t = initConvexTest();

    vi.useFakeTimers();
    try {
      expect(await t.mutation(internal.crons.cleanupResend, {})).toBeNull();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
  });
});
