import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";

import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  apiRead: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    capacity: 20,
    shards: 2,
  },

  apiWrite: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 10,
  },

  userAction: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 10,
  },

  // For operations that MUST eventually succeed (use with reserve: true)
  criticalAction: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 5,
    maxReserved: 20,
  },

  avatarUpload: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
});

export type RateLimitName =
  | "apiRead"
  | "apiWrite"
  | "userAction"
  | "criticalAction"
  | "avatarUpload";

export async function rateLimitWithThrow(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count, throws: true });
}

export async function consumeLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count });
}
