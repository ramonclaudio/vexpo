/// <reference types="vite/client" />
import { register as registerBetterAuth } from "@convex-dev/better-auth/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register as registerResend } from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { expect, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";

const rootModules = import.meta.glob("../../convex/**/*.ts");

type SeedCtx = { db: { insert: (table: string, doc: Record<string, unknown>) => Promise<string> } };

function baseConvexTest() {
  return convexTest(schema, rootModules);
}

export type AuthedTest = ReturnType<typeof baseConvexTest> & {
  runInComponent: <T>(component: string, fn: (ctx: SeedCtx) => Promise<T>) => Promise<T>;
};

export function initConvexTest(): AuthedTest {
  const t = baseConvexTest();
  registerBetterAuth(t);
  registerRateLimiter(t);
  registerResend(t);
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

export async function seedAuthedUser(
  t: AuthedTest,
  overrides: {
    deletedAt?: number;
    name?: string;
    email?: string;
    expiresAt?: number;
    isAnonymous?: boolean;
    guestSince?: number;
  } = {},
): Promise<SeededUser> {
  const now = Date.now();
  const name = overrides.name ?? "Ada Lovelace";
  const email = overrides.email ?? `user${++seq}@example.com`;

  const { authUserId, sessionId } = await t.runInComponent("betterAuth", async (ctx) => {
    const userId = await ctx.db.insert("user", {
      name,
      email,
      emailVerified: !overrides.isAnonymous,
      isAnonymous: overrides.isAnonymous,
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
      guestSince: overrides.isAnonymous ? (overrides.guestSince ?? now) : undefined,
    }),
  );

  return { authUserId, sessionId, appUserId, name, email };
}

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

export async function seedToken(
  t: AuthedTest,
  userId: Id<"users">,
  token: string,
  overrides: { revoked?: boolean; updatedAt?: number } = {},
) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("pushTokens", {
      userId,
      token,
      deviceType: "ios" as const,
      createdAt: now,
      updatedAt: overrides.updatedAt ?? now,
      lastSeenAt: now,
      revoked: overrides.revoked ?? false,
      revokedAt: overrides.revoked ? now : undefined,
    }),
  );
}

export function identityFor(authUserId: string, sessionId: string) {
  return {
    subject: authUserId,
    sessionId,
    issuer: "https://convex.test",
    tokenIdentifier: `https://convex.test|${authUserId}`,
  };
}

export async function auditRowsFor(t: AuthedTest, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("accountDeletionAudit")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
  );
}

export async function componentSessionsFor(t: AuthedTest, authUserId: string) {
  return t.runInComponent("betterAuth", async (ctx) => {
    const db = ctx.db as unknown as {
      query: (table: string) => { collect: () => Promise<Array<{ userId: string }>> };
    };
    const all = await db.query("session").collect();
    return all.filter((s) => s.userId === authUserId);
  });
}

export const AUTH_ENV: Record<string, string> = {
  CONVEX_SITE_URL: "https://test.convex.site",
  SITE_URL: "vexpo://",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
};

export function stubAuthEnv(extra: Record<string, string> = {}): void {
  for (const [key, value] of Object.entries({ ...AUTH_ENV, ...extra })) vi.stubEnv(key, value);
}

export function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}
