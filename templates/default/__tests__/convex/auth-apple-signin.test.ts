/// <reference types="vite/client" />
/**
 * Native Sign in with Apple, end to end over the Better Auth HTTP routes.
 *
 * Apple's identity token carries the bundle id in `aud`, while APPLE_CLIENT_ID
 * holds the Services ID (the web flow's audience). Better Auth verifies against
 * `audience ?? appBundleIdentifier ?? clientId`, so dropping `appBundleIdentifier`
 * from convex/auth.ts rejects every native sign-in with a 401 while the button
 * and the Apple sheet both still work, which reads as an app bug and fails App
 * Review. Both directions are pinned here.
 *
 * The token is minted locally with an ES256 key and Apple's JWKS endpoint is
 * stubbed on global fetch, which is what `apple.idToken.jwks` calls.
 */
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { initConvexTest, type AuthedTest } from "./_harness";

const BUNDLE_ID = "com.example.vexpo";
const SERVICES_ID = "com.example.vexpo.signin";
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const KID = "test-apple-key";

const ENV: Record<string, string> = {
  CONVEX_SITE_URL: "https://test.convex.site",
  SITE_URL: "vexpo://",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  APPLE_CLIENT_ID: SERVICES_ID,
  APPLE_CLIENT_SECRET: "test-apple-client-secret",
  APP_BUNDLE_ID: BUNDLE_ID,
};

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

/** An Apple identity token for the native flow: `aud` is the bundle id. */
async function mintIdentityToken(sub: string, email: string) {
  return new SignJWT({ email, email_verified: true, is_private_email: false })
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setIssuer(APPLE_ISSUER)
    .setAudience(BUNDLE_ID)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

function signInWithApple(
  t: AuthedTest,
  token: string,
  user?: { name: { firstName: string; lastName: string } },
) {
  return t.fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: ENV.SITE_URL },
    body: JSON.stringify({ provider: "apple", idToken: { token, ...(user ? { user } : {}) } }),
  });
}

describe("native Sign in with Apple", () => {
  beforeEach(async () => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);

    const keys = await generateKeyPair("ES256", { extractable: true });
    privateKey = keys.privateKey;
    publicJwk = { ...(await exportJWK(keys.publicKey)), kid: KID, alg: "ES256", use: "sig" };

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(APPLE_JWKS_URL)) {
        return Promise.resolve(
          new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return realFetch(input, init);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("creates an account when the token audience is the bundle id", async () => {
    const t = initConvexTest();
    const response = await signInWithApple(t, await mintIdentityToken("apple-sub-1", "a@b.test"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token?: string; user?: { email?: string } };
    expect(body.token).toEqual(expect.any(String));
    expect(body.user?.email).toBe("a@b.test");

    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
  });

  // Apple hands back `fullName` on the FIRST authorization only, and the
  // identity token carries no name claim, so this payload is the single chance
  // to get a name onto the account. It is also the path a reviewer with a fresh
  // Apple ID takes, so a wrong shape here fails exactly the people who matter.
  test("stores the name Apple returns on the first authorization", async () => {
    const t = initConvexTest();
    const response = await signInWithApple(t, await mintIdentityToken("apple-sub-3", "e@f.test"), {
      name: { firstName: "Ada", lastName: "Lovelace" },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user?: { name?: string } };
    expect(body.user?.name).toBe("Ada Lovelace");
  });

  test("still signs in when Apple returns no name", async () => {
    const t = initConvexTest();
    const response = await signInWithApple(t, await mintIdentityToken("apple-sub-4", "g@h.test"));

    expect(response.status).toBe(200);
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
  });

  test("rejects the token when appBundleIdentifier is missing", async () => {
    // Unsetting APP_BUNDLE_ID is exactly what convex/auth.ts looked like before
    // the fix: the audience falls back to the Services ID and Apple's token,
    // whose `aud` is the bundle id, fails verification.
    vi.stubEnv("APP_BUNDLE_ID", "");

    const t = initConvexTest();
    const response = await signInWithApple(t, await mintIdentityToken("apple-sub-2", "c@d.test"));

    expect(response.status).toBe(401);
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(0);
  });
});
