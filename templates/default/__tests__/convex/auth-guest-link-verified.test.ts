/// <reference types="vite/client" />
/**
 * The guest -> account link when email verification is on, which is what
 * production runs (`npx vexpo full` sets REQUIRE_EMAIL_VERIFICATION).
 *
 * On this path /sign-up/email answers with no session: the account exists but
 * is unverified, so the anonymous plugin's after-hook sees no session cookie
 * and does nothing, and the guest has to survive that call. The link then
 * happens on /email-otp/verify-email, which `autoSignInAfterVerification`
 * turns into the sign-in. Two things the lite-path test cannot prove:
 *
 *   - sign-up with verification on leaves the guest row and its data alone
 *   - the OTP verify is a link point, so the guest's data reaches the account
 *
 * Own file because convex/env.ts reads the flag once at module load.
 * RESEND_TEST_MODE is on by default in tests, so the code lands on the console
 * instead of in an inbox, and the test reads it back from there.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { initConvexTest, type AuthedTest } from "./_harness";

const ENV: Record<string, string> = {
  CONVEX_SITE_URL: "https://test.convex.site",
  SITE_URL: "vexpo://",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
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
      origin: ENV.SITE_URL,
      ...(cookie && { cookie }),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}

describe("guest -> account link with email verification on", () => {
  let logged: string[];

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
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

    // No session comes back: the account is unverified. The after-hook must
    // not fire here, or the guest would be deleted before the merge ever ran.
    const signUp = await post(t, "/sign-up/email", ACCOUNT, cookie);
    expect(signUp.status).toBe(200);
    expect(((await signUp.json()) as { token: string | null }).token).toBeNull();

    const afterSignUp = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(afterSignUp).toHaveLength(2);
    expect(afterSignUp.find((u) => u._id === guest._id)?.bio).toBe("written as a guest");

    // The code went to the console, not an inbox.
    const otp = logged
      .map((line) => /\[otp\] email-verification for ada@example\.com: (\d{6})/.exec(line)?.[1])
      .find(Boolean);
    expect(otp).toBeDefined();

    const verify = await post(t, "/email-otp/verify-email", { email: ACCOUNT.email, otp }, cookie);
    expect(verify.status).toBe(200);
    expect(((await verify.json()) as { token: string | null }).token).toEqual(expect.any(String));

    // One row left, the account, and the guest's bio is on it.
    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).not.toBe(guest._id);
    expect(rows[0].guestSince).toBeUndefined();
    expect(rows[0].bio).toBe("written as a guest");
  });
});
