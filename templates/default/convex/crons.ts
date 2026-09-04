import { cronJobs } from "convex/server";

import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const crons = cronJobs();

crons.daily(
  "cleanup stale push tokens",
  { hourUTC: 3, minuteUTC: 0 },
  internal.pushTokens.cleanupStale,
);

crons.interval("reconcile push receipts", { minutes: 15 }, internal.pushSender.reconcileReceipts);

crons.daily(
  "hard-delete expired account tombstones",
  { hourUTC: 4, minuteUTC: 0 },
  internal.users.hardDeleteExpired,
);

crons.daily(
  "purge abandoned guest accounts",
  { hourUTC: 4, minuteUTC: 30 },
  internal.users.purgeAbandonedGuests,
  {},
);

crons.interval(
  "Remove old emails from the resend component",
  { hours: 1 },
  internal.crons.cleanupResend,
);

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const cleanupResend = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: ONE_WEEK_MS,
    });
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, {
      olderThan: 4 * ONE_WEEK_MS,
    });
  },
});

export default crons;
