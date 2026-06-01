import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { createAuth } from "./auth";
import { rateLimiter, type RateLimitName } from "./rateLimit";

/**
 * Idempotent: if the user already exists, just re-asserts emailVerified=true.
 * Does NOT rotate the password on re-run, delete the user from the dashboard
 * first if you need a fresh password.
 *
 * Side effect: triggers a verification OTP email on first run via the normal
 * sign-up flow. The OTP is unused (we flip emailVerified directly via the
 * adapter) and lands in the configured inbox.
 */
export const createReviewAccount = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    username: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.string(),
    email: v.string(),
    created: v.boolean(),
    verified: v.boolean(),
    name: v.string(),
  }),
  handler: async (ctx, { email, password, name, username }) => {
    const auth = createAuth(ctx);

    type User = { _id?: string; id?: string; email: string; emailVerified: boolean };

    const lookup = async (): Promise<User | null> =>
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "email", value: email }],
      } as never)) as User | null;

    let user = await lookup();
    let created = false;

    if (!user) {
      const body: Record<string, string> = { email, password, name };
      if (username) body.username = username;
      await auth.api.signUpEmail({
        body: body as { email: string; password: string; name: string },
        asResponse: false,
      });
      user = await lookup();
      if (!user) throw new Error("user not found after signUpEmail");
      created = true;
    }

    const docId = user._id ?? user.id;
    if (!docId) throw new Error("user document is missing both _id and id");

    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: docId }],
        update: { emailVerified: true },
      },
    } as never);

    return {
      userId: docId,
      email,
      created,
      verified: true,
      name,
    };
  },
});

export const resetRateLimit = internalMutation({
  args: { name: v.string(), key: v.optional(v.string()) },
  returns: v.object({
    reset: v.boolean(),
    name: v.string(),
    key: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { name, key }) => {
    await rateLimiter.reset(ctx, name as RateLimitName, key ? { key } : undefined);
    return { reset: true, name, key: key ?? null };
  },
});
