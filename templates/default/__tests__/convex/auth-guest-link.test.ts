/// <reference types="vite/client" />
/**
 * The guest -> account link, end to end over the Better Auth HTTP routes.
 *
 * `users-mergeGuestData.test.ts` covers the merge logic by calling the mutation
 * directly. This covers everything between the tap and that call, which is the
 * part reasoning can't settle:
 *
 *   - the anonymous plugin's after-hook fires on /sign-up/email at all
 *   - `anonymousUser.user.id` is the same string the app `users.authId` holds,
 *     so the merge finds its rows instead of throwing "no users row" inside the
 *     sign-up response and breaking guest sign-up outright
 *   - `requireRunMutationCtx(ctx)` resolves in the http-action context Better
 *     Auth runs in
 *   - Better Auth's own delete of the guest user runs the `user.onDelete`
 *     trigger, so the guest row goes with it
 *
 * Lite path (REQUIRE_EMAIL_VERIFICATION unset): sign-up auto-verifies and
 * returns a session in the same call, so the link happens on /sign-up/email.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

import { initConvexTest, type AuthedTest } from "./_harness";

const ENV: Record<string, string> = {
  CONVEX_SITE_URL: "https://test.convex.site",
  SITE_URL: "vexpo://",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
};

function signInAnonymous(t: AuthedTest) {
  return t.fetch("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: ENV.SITE_URL },
    body: JSON.stringify({}),
  });
}

const ACCOUNT = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

function signUpEmail(t: AuthedTest, cookie?: string) {
  return t.fetch("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: ENV.SITE_URL,
      ...(cookie && { cookie }),
    },
    body: JSON.stringify(ACCOUNT),
  });
}

function signInEmail(t: AuthedTest, cookie: string) {
  return t.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: ENV.SITE_URL, cookie },
    body: JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.password }),
  });
}

async function seedPushToken(t: AuthedTest, userId: Id<"users">, token: string) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("pushTokens", {
      userId,
      token,
      deviceType: "ios" as const,
      createdAt: now,
      updatedAt: now,
      revoked: false,
    }),
  );
}

/** The session cookie Better Auth just set, in request form. */
function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}

describe("guest -> account link", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  test("signing up as a guest carries the guest's rows onto the new account", async () => {
    const t = initConvexTest();

    const guestResponse = await signInAnonymous(t);
    expect(guestResponse.status).toBe(200);

    // One guest, mirrored into the app `users` table by the onCreate trigger
    // with `guestSince` stamped so the reaper can find it later.
    const guestRows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(guestRows).toHaveLength(1);
    expect(guestRows[0].guestSince).toEqual(expect.any(Number));

    // Something worth keeping. Push registration is the first thing the stock
    // app writes for a guest, so it is what the merge has to carry.
    const tokenId = await seedPushToken(t, guestRows[0]._id, "ExponentPushToken[guest]");

    const signUpResponse = await signUpEmail(t, sessionCookie(guestResponse));
    expect(signUpResponse.status).toBe(200);

    // One row left: the account. Better Auth deleted the guest user after the
    // link, and that delete runs the onDelete trigger, unlike the component
    // adapter path `purgeUser` has to use.
    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).not.toBe(guestRows[0]._id);
    expect(rows[0].guestSince).toBeUndefined();

    // And the token followed. This is the assertion that fails if the id the
    // hook hands the merge isn't the one `users.authId` stores.
    const token = await t.run(async (ctx) => ctx.db.get(tokenId));
    expect(token?.userId).toBe(rows[0]._id);
  });

  test("signing in to an existing account from a guest keeps the account's profile", async () => {
    const t = initConvexTest();

    // The account first, on its own, with a bio already set.
    expect((await signUpEmail(t)).status).toBe(200);
    const [account] = await t.run(async (ctx) => ctx.db.query("users").collect());
    await t.run(async (ctx) => ctx.db.patch(account._id, { bio: "account bio" }));

    // Then a guest on a fresh cookie jar, with a bio of their own and a token.
    const guestResponse = await signInAnonymous(t);
    const guest = (await t.run(async (ctx) => ctx.db.query("users").collect())).find(
      (u) => u._id !== account._id,
    )!;
    await t.run(async (ctx) => ctx.db.patch(guest._id, { bio: "guest bio" }));
    const tokenId = await seedPushToken(t, guest._id, "ExponentPushToken[same-device]");

    expect((await signInEmail(t, sessionCookie(guestResponse))).status).toBe(200);

    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(account._id);
    expect(rows[0].bio).toBe("account bio");
    expect((await t.run(async (ctx) => ctx.db.get(tokenId)))?.userId).toBe(account._id);
  });

  test("the plugin's own delete of a guest takes the push tokens with it", async () => {
    // `/delete-anonymous-user` is Better Auth's endpoint, not the app's, but
    // it is registered, so it has to leave the tables as clean as `discardGuest`
    // does. It runs the `user.onDelete` trigger, which is why the trigger owns
    // the push-token cleanup and not just the row.
    const t = initConvexTest();
    const guestResponse = await signInAnonymous(t);
    const [guest] = await t.run(async (ctx) => ctx.db.query("users").collect());
    const tokenId = await seedPushToken(t, guest._id, "ExponentPushToken[guest]");

    const response = await t.fetch("/api/auth/delete-anonymous-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: ENV.SITE_URL,
        cookie: sessionCookie(guestResponse),
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(200);

    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.get(tokenId))).toBeNull();
  });

  test("a second anonymous sign-in on a live guest session is refused", async () => {
    const t = initConvexTest();

    const first = await signInAnonymous(t);
    expect(first.status).toBe(200);

    const second = await t.fetch("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: ENV.SITE_URL,
        cookie: sessionCookie(first),
      },
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(400);

    // One guest row, not two. This is what keeps the table bounded without a
    // per-hour rate limit that would lock out everyone behind one NAT address.
    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });
});
