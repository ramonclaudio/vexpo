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
