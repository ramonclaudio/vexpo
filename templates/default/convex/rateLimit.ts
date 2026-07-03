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

  // Sensitive account mutations (delete/restore). A throttle, not a hard block.
  // A real user deletes once, so a legitimate one-shot call never approaches the
  // capacity-5 bucket. A throttled caller's tokens refill at `rate`, so a retry
  // after the `retryAfter` window succeeds. Apple 5.1.1(v) in-app deletion still
  // works.
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
