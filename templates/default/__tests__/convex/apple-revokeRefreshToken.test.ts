/// <reference types="vite/client" />
/**
 * `apple.revokeRefreshToken` is Apple's account-deletion requirement: "If
 * people used Sign in with Apple to create an account within your app, you
 * revoke the associated tokens when they delete their account."
 * `users.hardDeleteExpired` schedules it per Apple account it finds.
 *
 * Every path here is best-effort on purpose. The user has already confirmed
 * deletion and the local rows are about to go, so a dead Apple endpoint must
 * log and return rather than throw and strand the purge mid-way.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";

import { initConvexTest } from "./_harness";

const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

let calls: Array<{ url: string; body: string }>;

function stubFetch(respond: () => Promise<Response>) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(REVOKE_URL)) {
      calls.push({ url, body: String(init?.body ?? "") });
      return respond();
    }
    return realFetch(input, init);
  });
}

describe("apple.revokeRefreshToken", () => {
  beforeEach(() => {
    calls = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("posts the form Apple's REST API expects", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "com.example.vexpo.signin");
    vi.stubEnv("APPLE_CLIENT_SECRET", "signed-es256-jwt");
    stubFetch(async () => new Response("", { status: 200 }));

    const t = initConvexTest();
    expect(
      await t.action(internal.apple.revokeRefreshToken, { refreshToken: "rt-123" }),
    ).toBeNull();

    expect(calls).toHaveLength(1);
    const sent = new URLSearchParams(calls[0].body);
    expect(sent.get("client_id")).toBe("com.example.vexpo.signin");
    expect(sent.get("client_secret")).toBe("signed-es256-jwt");
    expect(sent.get("token")).toBe("rt-123");
    // Without the hint Apple treats it as an access token and the revoke is
    // a silent no-op.
    expect(sent.get("token_type_hint")).toBe("refresh_token");
  });

  test("skips the call entirely when Apple is not configured", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "");
    vi.stubEnv("APPLE_CLIENT_SECRET", "");
    stubFetch(async () => new Response("", { status: 200 }));

    const t = initConvexTest();
    expect(
      await t.action(internal.apple.revokeRefreshToken, { refreshToken: "rt-123" }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
    expect(console.warn).toHaveBeenCalled();
  });

  test("an error response is logged, not thrown: the purge has to finish", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "com.example.vexpo.signin");
    vi.stubEnv("APPLE_CLIENT_SECRET", "signed-es256-jwt");
    stubFetch(async () => new Response("invalid_grant", { status: 400 }));

    const t = initConvexTest();
    await expect(
      t.action(internal.apple.revokeRefreshToken, { refreshToken: "rt-123" }),
    ).resolves.toBeNull();
    expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain("400");
  });

  test("a network throw is swallowed the same way", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "com.example.vexpo.signin");
    vi.stubEnv("APPLE_CLIENT_SECRET", "signed-es256-jwt");
    stubFetch(async () => {
      throw new Error("socket hang up");
    });

    const t = initConvexTest();
    await expect(
      t.action(internal.apple.revokeRefreshToken, { refreshToken: "rt-123" }),
    ).resolves.toBeNull();
    expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain("socket hang up");
  });
});
