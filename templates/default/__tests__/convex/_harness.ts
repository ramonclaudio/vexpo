/// <reference types="vite/client" />
/**
 * Shared convexTest harness for the authed Convex functions.
 *
 * Auth chain: authMutation -> requireAuthenticatedUser -> safeGetAuthUser, which
 * reads the @convex-dev/better-auth component (a `session` by _id whose
 * `expiresAt` is in the future, then a `user` by _id == identity.subject) and
 * the mirrored app `users` row (by `authId`). So an authenticated call needs a
 * component user + unexpired session (we capture their REAL ids), a `users` row
 * keyed by that authId, and an identity whose `subject`/`sessionId` match.
 *
 * convex-test exposes `runInComponent` (to seed component tables) at runtime but
 * not in its public types; `AuthedTest` narrows it back so callers stay typed.
 */
import { register as registerBetterAuth } from "@convex-dev/better-auth/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";

import type { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";

const rootModules = import.meta.glob("../../convex/**/*.ts");

type SeedCtx = { db: { insert: (table: string, doc: Record<string, unknown>) => Promise<string> } };

// Derive the schema-typed TestConvex from a real convexTest(schema) call, so
// `t.run` ctx.db is typed to the app schema. `ReturnType<typeof convexTest>`
// alone falls back to the empty default schema.
function baseConvexTest() {
  return convexTest(schema, rootModules);
}

export type AuthedTest = ReturnType<typeof baseConvexTest> & {
  runInComponent: <T>(component: string, fn: (ctx: SeedCtx) => Promise<T>) => Promise<T>;
};

/** convexTest with the components the authed functions cross (better-auth, rate-limiter). */
export function initConvexTest(): AuthedTest {
  const t = baseConvexTest();
  registerBetterAuth(t);
  registerRateLimiter(t);
  return t as AuthedTest;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
let seq = 0;

export type SeededUser = {
  authUserId: string;
  sessionId: string;
  appUserId: Id<"users">;
  name: string;
  email: string;
};

/**
 * Seed a Better Auth user + unexpired session and the mirrored app `users` row.
 * Pass `deletedAt` to tombstone the app row, `expiresAt` (in the past) to test
 * an expired session, or `name`/`email` to assert specific identity fields.
 */
export async function seedAuthedUser(
  t: AuthedTest,
  overrides: { deletedAt?: number; name?: string; email?: string; expiresAt?: number } = {},
): Promise<SeededUser> {
  const now = Date.now();
  const name = overrides.name ?? "Ada Lovelace";
  const email = overrides.email ?? `user${++seq}@example.com`;

  const { authUserId, sessionId } = await t.runInComponent("betterAuth", async (ctx) => {
    const userId = await ctx.db.insert("user", {
      name,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const session = await ctx.db.insert("session", {
      userId,
      token: `tok_${userId}`,
      expiresAt: overrides.expiresAt ?? now + SEVEN_DAYS,
      createdAt: now,
      updatedAt: now,
    });
    return { authUserId: userId, sessionId: session };
  });

  const appUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId: authUserId,
      createdAt: now,
      updatedAt: now,
      deletedAt: overrides.deletedAt,
    }),
  );

  return { authUserId, sessionId, appUserId, name, email };
}

/** Minimal app `users` row for push tests, no auth chain. */
export async function seedUser(t: AuthedTest) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authId: `auth-${now}-${Math.random()}`,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

/** Active push token owned by `userId`. */
export async function seedToken(t: AuthedTest, userId: Id<"users">, token: string) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("pushTokens", {
      userId,
      token,
      deviceType: "ios" as const,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      revoked: false,
    }),
  );
}

/** Identity for `t.withIdentity(...)` matching a seeded user's component ids. */
export function identityFor(authUserId: string, sessionId: string) {
  return {
    subject: authUserId,
    sessionId,
    issuer: "https://convex.test",
    tokenIdentifier: `https://convex.test|${authUserId}`,
  };
}

/** Account-deletion audit rows for one app user, oldest first. */
export async function auditRowsFor(t: AuthedTest, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("accountDeletionAudit")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

/**
 * Better Auth component `session` rows for one auth user. `runInComponent`
 * exposes a real ctx but its public type only narrows `db.insert`, so cast to
 * read; filtering in JS avoids depending on the component's index names.
 */
export async function componentSessionsFor(t: AuthedTest, authUserId: string) {
  return t.runInComponent("betterAuth", async (ctx) => {
    const db = ctx.db as unknown as {
      query: (table: string) => { collect: () => Promise<Array<{ userId: string }>> };
    };
    const all = await db.query("session").collect();
    return all.filter((s) => s.userId === authUserId);
  });
}
