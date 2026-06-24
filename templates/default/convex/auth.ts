import { expo } from "@better-auth/expo";
import { createClient } from "@convex-dev/better-auth";
import type { AuthFunctions, GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth/minimal";
import { emailOTP, username } from "better-auth/plugins";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import { internalAction, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";
import {
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

const authFunctions: AuthFunctions = internal.auth;

export async function getUserByAuthId(
  ctx: QueryCtx | MutationCtx,
  authId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", authId))
    .unique();
}

export type AuthUser = Doc<"users"> & {
  authUserId: string;
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
        await ctx.db.insert("users", {
          authId: authUser._id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      },
      onDelete: async (ctx, authUser) => {
        const user = await getUserByAuthId(ctx, authUser._id);
        if (!user) return;
        // Free the avatar blob before dropping the row so we don't leak storage.
        if (user.avatar) await ctx.storage.delete(user.avatar);
        await ctx.db.delete(user._id);
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
      "vexpo://",
      env.siteUrl,
      // In dev, Expo Go uses `exp://<lan-ip>:<port>` and the dev client uses
      // `exp+<scheme>://`. Wildcards match the host/port suffix that Better
      // Auth sees in the request origin. Production builds drop these.
      ...(process.env.NODE_ENV === "development"
        ? ["exp://*", "exp://**", "http://localhost:8081"]
        : []),
    ],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      // Email verification is gated on the `REQUIRE_EMAIL_VERIFICATION`
      // Convex env var. The lite-mode setup (`npx vexpo lite`) leaves it
      // unset (default `false`) so sign-up creates verified accounts
      // immediately and the user can sign in without an OTP. No Resend
      // configuration needed to get up and running on the iOS Simulator.
      // `npx vexpo full` flips this to `true` when it provisions Resend.
      // Production runs with verification on.
      requireEmailVerification: env.requireEmailVerification,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // When verification is off, accounts land verified-on-create so
      // password sign-in works without the email round-trip.
      autoSignIn: !env.requireEmailVerification,
    },
    emailVerification: {
      // When `emailOtp.verifyEmail` succeeds, Better Auth creates a session and
      // sets the cookie inline instead of returning { token: null } and forcing
      // the user to sign in manually.
      autoSignInAfterVerification: true,
    },
    // Only register the Apple provider when its credentials are present.
    // Better Auth logs a warning on every request otherwise, and the client
    // hides the button via `getEnabledProviders` when the env vars are unset,
    // so registering an empty provider serves no purpose.
    socialProviders:
      process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
        ? {
            apple: {
              clientId: process.env.APPLE_CLIENT_ID,
              clientSecret: process.env.APPLE_CLIENT_SECRET,
            },
          }
        : {},
    session: {
      expiresIn: SEVEN_DAYS,
      updateAge: ONE_DAY,
      freshAge: TEN_MINUTES,
      cookieCache: { enabled: true, maxAge: FIVE_MINUTES },
    },
    // Better Auth handles HTTP-level rate limiting for all auth endpoints.
    // Custom rules use EXACT match unless the key contains "*" (wildcard).
    // Paths here are the post-basePath form (Better Auth strips /api/auth).
    // This app uses the email-OTP flow exclusively, so password reset and
    // verification hit /email-otp/* rather than the link-based endpoints.
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
        // Only send a verification OTP on sign-up when verification is
        // actually required. Minimal-tier setup short-circuits the OTP
        // so users can sign up without ever opening their email.
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
  // Set when the user has requested account deletion. Within the 30-day
  // grace window the user is still authenticated; the client routes
  // these users to a "restore or continue with deletion" surface.
  deletedAt: v.optional(v.number()),
  authUserId: v.string(),
  email: v.string(),
  name: v.string(),
  emailVerified: v.boolean(),
  image: v.union(v.string(), v.null()),
  username: v.union(v.string(), v.null()),
  displayUsername: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  hasUploadedAvatar: v.boolean(),
});

// These use the raw `query` builder because this file IS the auth primitive
// that functions.ts depends on. Importing wrappers from ./functions would
// create a circular dependency.

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

/**
 * Public read of which auth features are configured server-side. Lets the
 * client hide buttons that would fail at submit (e.g. Apple Sign In with empty
 * `APPLE_CLIENT_ID`, OTP sign-in or password reset with `REQUIRE_EMAIL_VERIFICATION`
 * unset). Returns booleans only, never leaks the credentials.
 *
 * `emailFeatures` is true when `REQUIRE_EMAIL_VERIFICATION` is set on the
 * Convex deployment env (testflight tier setup or later). When false, the
 * client hides OTP sign-in, password reset, change-email. the only working
 * flow is email + password sign-up/sign-in. This is the minimal-tier path:
 * users get into the app without configuring Resend or any DNS.
 */
export const getEnabledProviders = query({
  args: {},
  returns: v.object({ apple: v.boolean(), emailFeatures: v.boolean() }),
  handler: async () => {
    const apple = !!process.env.APPLE_CLIENT_ID && !!process.env.APPLE_CLIENT_SECRET;
    const emailFeatures = env.requireEmailVerification;
    return { apple, emailFeatures };
  },
});

/**
 * Manual ops tool, deliberately NOT on a cron. `rotateKeys` deletes the whole
 * JWKS and regenerates it with no grace period, so every JWT signed by the old
 * key stops verifying and Convex (which validates tokens against `/convex/jwks`)
 * rejects them until clients re-fetch a token. A scheduled run would invalidate
 * every active session on each fire. Run it by hand only when you must rotate
 * (suspected key compromise): `npx convex run auth:rotateKeys`.
 */
export const rotateKeys = internalAction({
  args: {},
  // Better Auth's `rotateKeys()` returns implementation-specific JWKS metadata
  // that we don't constrain here. `v.any()` documents the upstream contract.
  returns: v.any(),
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    return auth.api.rotateKeys();
  },
});
