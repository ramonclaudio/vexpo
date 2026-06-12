import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";

import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  userAction: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 10,
  },

  // Sensitive account mutations (delete/restore). A throttle, not a hard block:
  // a legitimate one-shot call never approaches the capacity-5 bucket, and a
  // throttled caller's tokens refill at `rate`, so a retry after the
  // `retryAfter` window succeeds. That, not `reserve`, is how these "must
  // eventually succeed" (reserve returns ok-with-retryAfter, which `throws`
  // would reject anyway, and is meant for deferred/scheduled work, not a
  // synchronous mutation that returns its result inline). Apple 5.1.1(v) in-app
  // deletion still works: a real user deletes once.
  criticalAction: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 5,
  },

  avatarUpload: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
});

export type RateLimitName = "userAction" | "criticalAction" | "avatarUpload";

export async function rateLimitWithThrow(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count, throws: true });
}
