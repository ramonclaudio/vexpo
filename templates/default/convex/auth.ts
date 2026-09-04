import { expo } from "@better-auth/expo";
import { createClient } from "@convex-dev/better-auth";
import type { AuthFunctions, GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth/minimal";
import { anonymous, emailOTP, username } from "better-auth/plugins";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import { internalAction, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";
import {
  GUEST_NAME,
  USERNAME_FORMAT_REGEX,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isReservedUsername,
} from "./constants";
import { sendAuthOTP } from "./email";
import { env } from "./env";
import { authenticationRequired } from "./errors";

const ONE_MINUTE = 60;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;
const SEVEN_DAYS = 7 * ONE_DAY;
const TEN_MINUTES = 10 * ONE_MINUTE;
const FIVE_MINUTES = 5 * ONE_MINUTE;

export const SESSION_MAX_AGE_MS = SEVEN_DAYS * 1000;

const authFunctions: AuthFunctions = internal.auth;

export async function getUserByAuthId(
  ctx: QueryCtx | MutationCtx,
  authId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authId))
    .unique();
}

export async function purgeAppUser(ctx: MutationCtx, authId: string): Promise<void> {
  const user = await getUserByAuthId(ctx, authId);
  if (!user) return;
  const tokens = await ctx.db
    .query("pushTokens")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .collect();
  await Promise.all(tokens.map((t) => ctx.db.delete(t._id)));
  if (user.avatar) await ctx.storage.delete(user.avatar);
  await ctx.db.delete(user._id);
}

export type AuthUser = Doc<"users"> & {
  authUserId: string;
  isAnonymous: boolean;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  username: string | null;
  displayUsername: string | null;
  avatarUrl: string | null;
  hasUploadedAvatar: boolean;
};

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        const now = Date.now();
        const isAnonymous = !!(authUser as { isAnonymous?: boolean | null }).isAnonymous;
        await ctx.db.insert("users", {
          authId: authUser._id,
          createdAt: now,
          updatedAt: now,
          guestSince: isAnonymous ? now : undefined,
        });
      },
      onDelete: async (ctx, authUser) => {
        await purgeAppUser(ctx, authUser._id);
      },
    },
  },
});

export const { onCreate, onDelete } = authComponent.triggersApi();

export const { getAuthUser } = authComponent.clientApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: env.convexSiteUrl,
    trustedOrigins: [
      env.siteUrl,
      ...(process.env.NODE_ENV === "development"
        ? ["exp://*", "exp://**", "http://localhost:8081"]
        : []),
    ],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: env.requireEmailVerification,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: !env.requireEmailVerification,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    socialProviders:
      process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
        ? {
            apple: {
              clientId: process.env.APPLE_CLIENT_ID,
              clientSecret: process.env.APPLE_CLIENT_SECRET,
              appBundleIdentifier: process.env.APP_BUNDLE_ID,
            },
          }
        : {},
    session: {
      expiresIn: SEVEN_DAYS,
      updateAge: ONE_DAY,
      freshAge: TEN_MINUTES,
      cookieCache: { enabled: true, maxAge: FIVE_MINUTES },
    },
    rateLimit: {
      enabled: true,
      window: ONE_MINUTE,
      max: 100,
      customRules: {
        "/sign-in/*": { window: ONE_MINUTE, max: 5 },
        "/sign-up/*": { window: ONE_MINUTE, max: 3 },
        "/email-otp/request-password-reset": { window: ONE_HOUR, max: 3 },
        "/email-otp/reset-password": { window: ONE_MINUTE, max: 3 },
        "/email-otp/send-verification-otp": { window: ONE_MINUTE, max: 3 },
        "/list-sessions": { window: ONE_MINUTE, max: 30 },
        "/get-session": { window: ONE_MINUTE, max: 60 },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      },
    },
    plugins: [
      convex({ authConfig }),
      emailOTP({
        otpLength: 6,
        expiresIn: FIVE_MINUTES,
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: env.requireEmailVerification,
        changeEmail: {
          enabled: true,
          verifyCurrentEmail: true,
        },
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendAuthOTP(ctx, { email, otp, type });
        },
      }),
      username({
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
        validationOrder: { username: "post-normalization" },
        usernameValidator: (normalized) => {
          if (isReservedUsername(normalized)) return false;
          return USERNAME_FORMAT_REGEX.test(normalized);
        },
      }),
      ...(env.guestMode
        ? [
            anonymous({
              generateName: () => GUEST_NAME,
              onLinkAccount: async ({ anonymousUser, newUser }) => {
                await requireRunMutationCtx(ctx).runMutation(internal.users.mergeGuestData, {
                  guestAuthId: anonymousUser.user.id,
                  authId: newUser.user.id,
                });
              },
            }),
          ]
        : []),
      expo(),
    ],
  } satisfies BetterAuthOptions);

export async function safeGetAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser | undefined> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) return undefined;

  const user = await getUserByAuthId(ctx, authUser._id);
  if (!user) return undefined;

  const hasUploadedAvatar = !!user.avatar;
  const avatarUrl = hasUploadedAvatar
    ? await ctx.storage.getUrl(user.avatar!)
    : (authUser.image ?? null);

  return {
    ...user,
    authUserId: authUser._id,
    isAnonymous: !!(authUser as { isAnonymous?: boolean | null }).isAnonymous,
    email: authUser.email,
    name: authUser.name,
    emailVerified: authUser.emailVerified,
    image: authUser.image ?? null,
    username: (authUser as { username?: string | null }).username ?? null,
    displayUsername: (authUser as { displayUsername?: string | null }).displayUsername ?? null,
    avatarUrl,
    hasUploadedAvatar,
  };
}

export async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const user = await safeGetAuthenticatedUser(ctx);
  if (!user) throw authenticationRequired();
  return user;
}

export const authUserValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authId: v.string(),
  bio: v.optional(v.string()),
  avatar: v.optional(v.id("_storage")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
  guestSince: v.optional(v.number()),
  authUserId: v.string(),
  isAnonymous: v.boolean(),
  email: v.string(),
  name: v.string(),
  emailVerified: v.boolean(),
  image: v.union(v.string(), v.null()),
  username: v.union(v.string(), v.null()),
  displayUsername: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  hasUploadedAvatar: v.boolean(),
});

export const hasPassword = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await safeGetAuthenticatedUser(ctx);
    if (!user) return false;
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const accounts = await auth.api.listUserAccounts({ headers });
    return accounts.some((account) => account.providerId === "credential");
  },
});

export const getEnabledProviders = query({
  args: {},
  returns: v.object({ apple: v.boolean(), emailFeatures: v.boolean(), guest: v.boolean() }),
  handler: async () => {
    const apple = !!process.env.APPLE_CLIENT_ID && !!process.env.APPLE_CLIENT_SECRET;
    const emailFeatures = env.requireEmailVerification;
    return { apple, emailFeatures, guest: env.guestMode };
  },
});

export const rotateKeys = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    return auth.api.rotateKeys();
  },
});
