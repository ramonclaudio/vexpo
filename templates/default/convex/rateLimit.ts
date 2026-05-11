/**
 * Rate Limiting Configuration
 *
 * Uses the @convex-dev/rate-limiter component for application-level rate
 * limiting.
 *
 * Authentication-related rate limiting (sign-in, sign-up, password reset)
 * is handled by Better Auth at the HTTP layer. See convex/auth.ts.
 *
 * @see https://www.convex.dev/components/rate-limiter
 */

import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";

import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

/**
 * Rate limiter instance using the component.
 * Defines all application rate limits in one place.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Read operations: permissive for good UX, sharded for throughput
  apiRead: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    capacity: 20,
    shards: 2,
  },

  // Write operations: stricter to prevent abuse
  apiWrite: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 10,
  },

  // General authenticated user actions
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

  // Avatar uploads (product-specific). Generous burst capacity so users
  // tweaking their photo a few times in a row don't trip it.
  avatarUpload: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
});

export type RateLimitName =
  | "apiRead"
  | "apiWrite"
  | "userAction"
  | "criticalAction"
  | "avatarUpload";

/**
 * Apply a rate limit and throw automatically if exceeded.
 */
export async function rateLimitWithThrow(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count, throws: true });
}

/**
 * Consume rate limit tokens without throwing.
 * Returns { ok, retryAfter } so HTTP callers can build a 429 response.
 */
export async function consumeLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count });
}
