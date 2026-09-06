/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  AUTH_ENV,
  type AuthedTest,
  initConvexTest,
  seedToken,
  sessionCookie,
  stubAuthEnv,
} from "./_harness";

function signInAnonymous(t: AuthedTest) {
  return t.fetch("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: AUTH_ENV.SITE_URL },
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
      origin: AUTH_ENV.SITE_URL,
      ...(cookie && { cookie }),
    },
    body: JSON.stringify(ACCOUNT),
  });
}

function signInEmail(t: AuthedTest, cookie: string) {
  return t.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: AUTH_ENV.SITE_URL, cookie },
    body: JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.password }),
  });
}

describe("guest -> account link", () => {
  beforeEach(() => {
    stubAuthEnv();
  });
  afterEach(() => vi.unstubAllEnvs());

  test("signing up as a guest carries the guest's rows onto the new account", async () => {
    const t = initConvexTest();

    const guestResponse = await signInAnonymous(t);
    expect(guestResponse.status).toBe(200);

    const guestRows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(guestRows).toHaveLength(1);
    expect(guestRows[0].guestSince).toEqual(expect.any(Number));

    const tokenId = await seedToken(t, guestRows[0]._id, "ExponentPushToken[guest]");

    const signUpResponse = await signUpEmail(t, sessionCookie(guestResponse));
    expect(signUpResponse.status).toBe(200);

    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).not.toBe(guestRows[0]._id);
    expect(rows[0].guestSince).toBeUndefined();

    const token = await t.run(async (ctx) => ctx.db.get(tokenId));
    expect(token?.userId).toBe(rows[0]._id);
  });

  test("signing in to an existing account from a guest keeps the account's profile", async () => {
    const t = initConvexTest();

    expect((await signUpEmail(t)).status).toBe(200);
    const [account] = await t.run(async (ctx) => ctx.db.query("users").collect());
    await t.run(async (ctx) => ctx.db.patch(account._id, { bio: "account bio" }));

    const guestResponse = await signInAnonymous(t);
    const guest = (await t.run(async (ctx) => ctx.db.query("users").collect())).find(
      (u) => u._id !== account._id,
    )!;
    await t.run(async (ctx) => ctx.db.patch(guest._id, { bio: "guest bio" }));
    const tokenId = await seedToken(t, guest._id, "ExponentPushToken[same-device]");

    expect((await signInEmail(t, sessionCookie(guestResponse))).status).toBe(200);

    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(account._id);
    expect(rows[0].bio).toBe("account bio");
    expect((await t.run(async (ctx) => ctx.db.get(tokenId)))?.userId).toBe(account._id);
  });

  test("the plugin's own delete of a guest takes the push tokens with it", async () => {
    const t = initConvexTest();
    const guestResponse = await signInAnonymous(t);
    const [guest] = await t.run(async (ctx) => ctx.db.query("users").collect());
    const tokenId = await seedToken(t, guest._id, "ExponentPushToken[guest]");

    const response = await t.fetch("/api/auth/delete-anonymous-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: AUTH_ENV.SITE_URL,
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
        origin: AUTH_ENV.SITE_URL,
        cookie: sessionCookie(first),
      },
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(400);

    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });
});
