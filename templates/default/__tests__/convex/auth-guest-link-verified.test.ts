/// <reference types="vite/client" />
// convex/env.ts reads the flag once at module load, so this must stay in its own file.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AUTH_ENV, type AuthedTest, initConvexTest, sessionCookie, stubAuthEnv } from "./_harness";

const ENV: Record<string, string> = {
  ...AUTH_ENV,
  REQUIRE_EMAIL_VERIFICATION: "true",
};

const ACCOUNT = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

function post(t: AuthedTest, path: string, body: unknown, cookie?: string) {
  return t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: AUTH_ENV.SITE_URL,
      ...(cookie && { cookie }),
    },
    body: JSON.stringify(body),
  });
}

describe("guest -> account link with email verification on", () => {
  let logged: string[];

  beforeEach(() => {
    stubAuthEnv(ENV);
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("sign-up leaves the guest in place and the OTP verify carries them over", async () => {
    const t = initConvexTest();

    const guestResponse = await post(t, "/sign-in/anonymous", {});
    expect(guestResponse.status).toBe(200);
    const cookie = sessionCookie(guestResponse);
    const [guest] = await t.run(async (ctx) => ctx.db.query("users").collect());
    await t.run(async (ctx) => ctx.db.patch(guest._id, { bio: "written as a guest" }));

    const signUp = await post(t, "/sign-up/email", ACCOUNT, cookie);
    expect(signUp.status).toBe(200);
    expect(((await signUp.json()) as { token: string | null }).token).toBeNull();

    const afterSignUp = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(afterSignUp).toHaveLength(2);
    expect(afterSignUp.find((u) => u._id === guest._id)?.bio).toBe("written as a guest");

    const otp = logged
      .map((line) => /\[otp\] email-verification for ada@example\.com: (\d{6})/.exec(line)?.[1])
      .find(Boolean);
    expect(otp).toBeDefined();

    const verify = await post(t, "/email-otp/verify-email", { email: ACCOUNT.email, otp }, cookie);
    expect(verify.status).toBe(200);
    expect(((await verify.json()) as { token: string | null }).token).toEqual(expect.any(String));

    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).not.toBe(guest._id);
    expect(rows[0].guestSince).toBeUndefined();
    expect(rows[0].bio).toBe("written as a guest");
  });
});
