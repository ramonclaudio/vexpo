import type { FunctionArgs } from "convex/server";
import { ConvexError, v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { SESSION_MAX_AGE_MS, authUserValidator, getUserByAuthId, purgeAppUser } from "./auth";
import { ACCOUNT_DELETION_GRACE_MS, BIO_MAX_LENGTH } from "./constants";
import { authMutation, optionalAuthQuery } from "./functions";
import { rateLimitWithThrow } from "./rateLimit";

export const getMe = optionalAuthQuery({
  args: {},
  returns: v.union(authUserValidator, v.null()),
  handler: async (ctx) => {
    return ctx.user ?? null;
  },
});

export const updateProfile = authMutation({
  args: { bio: v.optional(v.string()) },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    if (args.bio !== undefined && args.bio.length > BIO_MAX_LENGTH) {
      throw new ConvexError(`Bio must be ${BIO_MAX_LENGTH} characters or less`);
    }

    await ctx.db.patch(ctx.user._id, {
      bio: args.bio,
      updatedAt: Date.now(),
    });

    return ctx.user._id;
  },
});

export const generateAvatarUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "avatarUpload", ctx.user._id.toString());
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateAvatar = authMutation({
  args: { storageId: v.id("_storage") },
  returns: v.object({ avatarUrl: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    if (ctx.user.avatar) await ctx.storage.delete(ctx.user.avatar);

    await ctx.db.patch(ctx.user._id, {
      avatar: args.storageId,
      updatedAt: Date.now(),
    });

    return { avatarUrl: await ctx.storage.getUrl(args.storageId) };
  },
});

export const deleteAvatar = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    if (ctx.user.avatar) await ctx.storage.delete(ctx.user.avatar);

    await ctx.db.patch(ctx.user._id, {
      avatar: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const mergeGuestData = internalMutation({
  args: { guestAuthId: v.string(), authId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.guestAuthId === args.authId) return null;

    const target = await getUserByAuthId(ctx, args.authId);
    if (!target) throw new Error(`mergeGuestData: no users row for authId ${args.authId}`);

    const guest = await getUserByAuthId(ctx, args.guestAuthId);
    if (!guest) return null;

    const now = Date.now();
    await ctx.db.patch(target._id, await mergeProfile(ctx, guest, target, now));
    return null;
  },
});

type UserDoc = Doc<"users">;

// The avatar moves rather than copies, so the storage id has one owner.
async function mergeProfile(
  ctx: MutationCtx,
  guest: UserDoc,
  target: UserDoc,
  now: number,
): Promise<{ bio?: string; avatar?: Id<"_storage">; updatedAt: number }> {
  const patch: { bio?: string; avatar?: Id<"_storage">; updatedAt: number } = { updatedAt: now };
  if (guest.bio !== undefined && target.bio === undefined) patch.bio = guest.bio;
  if (guest.avatar !== undefined && target.avatar === undefined) {
    patch.avatar = guest.avatar;
    await ctx.db.patch(guest._id, { avatar: undefined });
  }
  return patch;
}

export const discardGuest = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    if (!ctx.user.isAnonymous) throw new ConvexError("This is not a guest session");
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());
    await purgeUser(ctx, ctx.user.authUserId);
    return { success: true };
  },
});

export const purgeAbandonedGuests = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const oldEnough = now - SESSION_MAX_AGE_MS;
    const page = await ctx.db
      .query("users")
      .withIndex("by_guestSince", (q) => q.gt("guestSince", undefined).lt("guestSince", oldEnough))
      .paginate({ numItems: HARD_DELETE_BATCH, cursor: args.cursor ?? null });

    let purged = 0;
    for (const guest of page.page) {
      if (await hasLiveSession(ctx, guest.authId, now)) continue;
      await purgeUser(ctx, guest.authId);
      purged++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.users.purgeAbandonedGuests, {
        cursor: page.continueCursor,
      });
    }

    return purged;
  },
});

async function hasLiveSession(ctx: MutationCtx, authUserId: string, now: number) {
  const sessions = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "session",
    where: [{ field: "userId", value: authUserId }],
    paginationOpts: { numItems: 100, cursor: null },
  })) as { page: Array<{ expiresAt: number }> };
  return sessions.page.some((s) => s.expiresAt > now);
}

const HARD_DELETE_BATCH = 50;

export const deleteAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean(), deletedAt: v.number() }),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());
    const now = Date.now();

    if (ctx.user.deletedAt) {
      return { success: true, deletedAt: ctx.user.deletedAt };
    }

    await deleteAllWhere(ctx, {
      model: "session",
      where: [{ field: "userId", value: ctx.user.authUserId }],
    });

    await ctx.db.patch(ctx.user._id, { deletedAt: now, updatedAt: now });

    return { success: true, deletedAt: now };
  },
});

export const restoreAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());

    if (ctx.user.deletedAt) {
      await ctx.db.patch(ctx.user._id, { deletedAt: undefined, updatedAt: Date.now() });
    }

    return { success: true };
  },
});

export const hardDeleteExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - ACCOUNT_DELETION_GRACE_MS;
    const expired = await ctx.db
      .query("users")
      .withIndex("by_deletedAt", (q) => q.gt("deletedAt", undefined).lt("deletedAt", cutoff))
      .take(HARD_DELETE_BATCH);

    for (const user of expired) await purgeUser(ctx, user.authId);

    if (expired.length === HARD_DELETE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.users.hardDeleteExpired, {});
    }

    return expired.length;
  },
});

async function purgeUser(ctx: MutationCtx, authUserId: string): Promise<void> {
  const authUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: authUserId }],
  })) as { email?: string } | null;

  const appleAccounts = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [
      { field: "userId", value: authUserId },
      { field: "providerId", value: "apple", connector: "AND" },
    ],
    paginationOpts: { numItems: 100, cursor: null },
  })) as { page: Array<Record<string, unknown>> };
  for (const account of appleAccounts.page) {
    const token = account.refreshToken;
    if (typeof token === "string" && token.length > 0) {
      await ctx.scheduler.runAfter(0, internal.apple.revokeRefreshToken, {
        refreshToken: token,
      });
    }
  }

  for (const model of ["session", "account"] as const) {
    await deleteAllWhere(ctx, { model, where: [{ field: "userId", value: authUserId }] });
  }
  if (authUser?.email) {
    await deleteAllWhere(ctx, {
      model: "verification",
      where: [{ field: "identifier", value: authUser.email }],
    });
  }

  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: { model: "user", where: [{ field: "_id", value: authUserId }] },
  });

  await purgeAppUser(ctx, authUserId);
}

type DeleteManyInput = FunctionArgs<typeof components.betterAuth.adapter.deleteMany>["input"];

const deleteAllWhere = async (ctx: MutationCtx, input: DeleteManyInput) => {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input,
      paginationOpts: { numItems: 100, cursor },
    })) as { isDone: boolean; continueCursor: string };
    isDone = result.isDone;
    cursor = result.continueCursor;
  }
};
