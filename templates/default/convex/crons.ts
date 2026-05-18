import { cronJobs } from "convex/server";

import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const crons = cronJobs();

// Drop push tokens that haven't refreshed in 30 days (stale device or app
// uninstalled). Bounded batches via `internal.pushTokens.cleanupStale`.
crons.daily(
  "cleanup stale push tokens",
  { hourUTC: 3, minuteUTC: 0 },
  internal.pushTokens.cleanupStale,
);

// Permanently purge soft-deleted accounts whose 30-day grace window has
// expired. Bounded batches via `internal.users.hardDeleteExpired`.
crons.daily(
  "hard-delete expired account tombstones",
  { hourUTC: 4, minuteUTC: 0 },
  internal.users.hardDeleteExpired,
);

// The Resend component retains finalized (delivered, cancelled, bounced)
// emails and it's our job to clear them. Run hourly to keep the emails table
// bounded. See @convex-dev/resend README → "Data retention".
crons.interval(
  "Remove old emails from the resend component",
  { hours: 1 },
  internal.crons.cleanupResend,
);

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const cleanupResend = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Delivered/cancelled/bounced: 7 day retention.
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: ONE_WEEK_MS,
    });
    // Abandoned emails usually indicate a bug, so keep them around longer
    // (4 weeks) for debugging before purging.
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, {
      olderThan: 4 * ONE_WEEK_MS,
    });
  },
});

export default crons;
