/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import {
  auditRowsFor,
  componentSessionsFor,
  identityFor,
  initConvexTest,
  seedAuthedUser,
  seedToken,
} from "./_harness";

const FAR_FUTURE = Date.now() + 7 * 24 * 60 * 60 * 1000;

describe("users.deleteAccount", () => {
  test("happy path: tombstones the user, drops push tokens, writes an audit row", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const pushTokenId = await seedToken(t, appUserId, "ExponentPushToken[abc123]");

    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.deletedAt).toBeUndefined();
    expect(await componentSessionsFor(t, authUserId)).toHaveLength(1);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const beforeCall = Date.now();
    const result = await asUser.mutation(api.users.deleteAccount, {});
    const afterCall = Date.now();

    expect(result.success).toBe(true);
    expect(result.deletedAt).toBeGreaterThanOrEqual(beforeCall);
    expect(result.deletedAt).toBeLessThanOrEqual(afterCall);

    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.deletedAt).toBe(result.deletedAt);
    expect(after?.updatedAt).toBe(result.deletedAt);

    const tokenGone = await t.run(async (ctx) => ctx.db.get(pushTokenId));
    expect(tokenGone).toBeNull();

    expect(await componentSessionsFor(t, authUserId)).toHaveLength(0);

    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.event).toBe("requested");
    expect(audit[0]!.authId).toBe(authUserId);
    expect(audit[0]!.at).toBe(result.deletedAt);
  });

  test("idempotent: a second call no-ops and does not write a duplicate audit row", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const first = await t
      .withIdentity(identityFor(authUserId, sessionId))
      .mutation(api.users.deleteAccount, {});

    const retryNow = Date.now();
    const retrySessionId = await t.runInComponent("betterAuth", async (ctx) => {
      const session = await ctx.db.insert("session", {
        userId: authUserId,
        token: `tok_retry_${authUserId}`,
        expiresAt: FAR_FUTURE,
        createdAt: retryNow,
        updatedAt: retryNow,
      });
      return session as string;
    });
    const asUser = t.withIdentity(identityFor(authUserId, retrySessionId));

    const second = await asUser.mutation(api.users.deleteAccount, {});
    expect(second.success).toBe(true);
    expect(second.deletedAt).toBe(first.deletedAt);

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.deletedAt).toBe(first.deletedAt);

    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.event).toBe("requested");
  });

  test("authMutation guard: rejects with ConvexError when unauthenticated", async () => {
    const t = initConvexTest();
    const { appUserId } = await seedAuthedUser(t);

    await expect(t.mutation(api.users.deleteAccount, {})).rejects.toThrowError(ConvexError);

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.deletedAt).toBeUndefined();
    expect(await auditRowsFor(t, appUserId)).toHaveLength(0);
  });
});
