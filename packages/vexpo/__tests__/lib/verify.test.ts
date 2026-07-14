import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signClientSecret } from "../../src/lib/apple-jwt";
import { readAppConfigFacts, summarize, verifyAll, type VerifyContext } from "../../src/lib/verify";

let workdir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "verify-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

let p8Pem: string;

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  p8Pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
});

// Sign through the exact production path so fixtures always match what the app
// emits. A negative expirationDays yields a cleanly past exp for the expiry cases.
function signSiwaJwt(opts: {
  teamId: string;
  keyId: string;
  servicesId: string;
  expirationDays: number;
}): Promise<string> {
  return signClientSecret({ privateKey: { contents: p8Pem }, ...opts });
}

function emptyContext(overrides: Partial<VerifyContext> = {}): VerifyContext {
  return {
    channel: "dev",
    envLocal: new Map(),
    envProd: new Map(),
    convexEnv: new Map(),
    convexProdEnv: new Map(),
    appConfig: {},
    ascCreds: null,
    ...overrides,
  };
}

describe("verifyAll - empty context", () => {
  beforeEach(() => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch;
  });

  it("emits checks even with no env data", async () => {
    const ctx = emptyContext();
    const checks = await verifyAll(ctx);
    expect(checks.length).toBeGreaterThan(0);
    const names = checks.map((c) => c.name);
    expect(names).toContain("better-auth-secret");
  });
});

describe("Apple JWT verification", () => {
  beforeEach(() => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch;
  });

  it("ok when JWT claims match Convex env", async () => {
    const teamId = "ABCDE12345";
    const keyId = "FGHIJ67890";
    const servicesId = "com.example.app.signin";
    const jwt = await signSiwaJwt({
      teamId,
      keyId,
      servicesId,
      expirationDays: 90,
    });
    const ctx = emptyContext({
      convexEnv: new Map([
        ["APPLE_TEAM_ID", teamId],
        ["APPLE_KEY_ID", keyId],
        ["APPLE_CLIENT_ID", servicesId],
        ["APPLE_CLIENT_SECRET", jwt],
      ]),
    });
    const checks = await verifyAll(ctx);
    const expiry = checks.find((c) => c.name === "jwt-expiry");
    expect(expiry?.severity).toBe("ok");
    const kid = checks.find((c) => c.name === "jwt-kid-matches");
    expect(kid?.severity).toBe("ok");
    const iss = checks.find((c) => c.name === "jwt-iss-matches");
    expect(iss?.severity).toBe("ok");
    const sub = checks.find((c) => c.name === "jwt-sub-matches");
    expect(sub?.severity).toBe("ok");
  });

  it("fails when JWT.kid does not match APPLE_KEY_ID", async () => {
    const jwt = await signSiwaJwt({
      teamId: "ABCDE12345",
      keyId: "WRONG12345",
      servicesId: "com.x.app.signin",
      expirationDays: 1,
    });
    const ctx = emptyContext({
      convexEnv: new Map([
        ["APPLE_TEAM_ID", "ABCDE12345"],
        ["APPLE_KEY_ID", "FGHIJ67890"],
        ["APPLE_CLIENT_ID", "com.x.app.signin"],
        ["APPLE_CLIENT_SECRET", jwt],
      ]),
    });
    const checks = await verifyAll(ctx);
    const kid = checks.find((c) => c.name === "jwt-kid-matches");
    expect(kid?.severity).toBe("fail");
    expect(kid?.message).toContain("WRONG12345");
  });

  it("fails when JWT is expired", async () => {
    const jwt = await signSiwaJwt({
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.x.app.signin",
      expirationDays: -1,
    });
    const ctx = emptyContext({
      convexEnv: new Map([
        ["APPLE_TEAM_ID", "ABCDE12345"],
        ["APPLE_KEY_ID", "FGHIJ67890"],
        ["APPLE_CLIENT_ID", "com.x.app.signin"],
        ["APPLE_CLIENT_SECRET", jwt],
      ]),
    });
    const checks = await verifyAll(ctx);
    const expiry = checks.find((c) => c.name === "jwt-expiry");
    expect(expiry?.severity).toBe("fail");
  });

  it("warns when JWT expires within 30 days", async () => {
    const jwt = await signSiwaJwt({
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.x.app.signin",
      // Half a day past the boundary: an exact 14 floors to 13d whenever a
      // second ticks between signing and the check.
      expirationDays: 14.5,
    });
    const ctx = emptyContext({
      convexEnv: new Map([
        ["APPLE_TEAM_ID", "ABCDE12345"],
        ["APPLE_KEY_ID", "FGHIJ67890"],
        ["APPLE_CLIENT_ID", "com.x.app.signin"],
        ["APPLE_CLIENT_SECRET", jwt],
      ]),
    });
    const checks = await verifyAll(ctx);
    const expiry = checks.find((c) => c.name === "jwt-expiry");
    expect(expiry?.severity).toBe("warn");
    expect(expiry?.message).toMatch(/14d/);
  });

  it("fails when JWT.iss != APPLE_TEAM_ID", async () => {
    const jwt = await signSiwaJwt({
      teamId: "WRONGTEAM1",
      keyId: "FGHIJ67890",
      servicesId: "com.x.app.signin",
      expirationDays: 1,
    });
    const ctx = emptyContext({
      convexEnv: new Map([
        ["APPLE_TEAM_ID", "ABCDE12345"],
        ["APPLE_KEY_ID", "FGHIJ67890"],
        ["APPLE_CLIENT_ID", "com.x.app.signin"],
        ["APPLE_CLIENT_SECRET", jwt],
      ]),
    });
    const checks = await verifyAll(ctx);
    const iss = checks.find((c) => c.name === "jwt-iss-matches");
    expect(iss?.severity).toBe("fail");
  });

  it("fails when JWT.sub != APPLE_CLIENT_ID", async () => {
    const jwt = await signSiwaJwt({
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.wrong.app.signin",
      expirationDays: 1,
    });
    const ctx = emptyContext({
      convexEnv: new Map([
        ["APPLE_TEAM_ID", "ABCDE12345"],
        ["APPLE_KEY_ID", "FGHIJ67890"],
        ["APPLE_CLIENT_ID", "com.right.app.signin"],
        ["APPLE_CLIENT_SECRET", jwt],
      ]),
    });
    const checks = await verifyAll(ctx);
    const sub = checks.find((c) => c.name === "jwt-sub-matches");
    expect(sub?.severity).toBe("fail");
  });

  it("fails when JWT body is corrupt", async () => {
    const ctx = emptyContext({
      convexEnv: new Map([["APPLE_CLIENT_SECRET", "not-a-jwt"]]),
    });
    const checks = await verifyAll(ctx);
    const decode = checks.find((c) => c.name === "jwt-decode");
    expect(decode?.severity).toBe("fail");
  });

  it("warns on suspicious team-id format", async () => {
    const ctx = emptyContext({
      convexEnv: new Map([["APPLE_TEAM_ID", "lowercase-bad"]]),
    });
    const checks = await verifyAll(ctx);
    const fmt = checks.find((c) => c.name === "team-id-format");
    expect(fmt?.severity).toBe("warn");
  });
});

describe("Coherence checks", () => {
  beforeEach(() => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch;
  });

  it("ok when bundle id matches across local + convex", async () => {
    const ctx = emptyContext({
      envLocal: new Map([["EXPO_PUBLIC_APP_BUNDLE_ID", "com.foo.bar"]]),
      convexEnv: new Map([["APP_BUNDLE_ID", "com.foo.bar"]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "bundle-id-match");
    expect(c?.severity).toBe("ok");
  });

  it("fails when bundle id mismatches", async () => {
    const ctx = emptyContext({
      envLocal: new Map([["EXPO_PUBLIC_APP_BUNDLE_ID", "com.foo.bar"]]),
      convexEnv: new Map([["APP_BUNDLE_ID", "com.foo.baz"]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "bundle-id-match");
    expect(c?.severity).toBe("fail");
    expect(c?.message).toContain("com.foo.bar");
    expect(c?.message).toContain("com.foo.baz");
  });

  it("fails when team id mismatches", async () => {
    const ctx = emptyContext({
      envLocal: new Map([["EXPO_PUBLIC_APPLE_TEAM_ID", "TEAM001"]]),
      convexEnv: new Map([["APPLE_TEAM_ID", "TEAM002"]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "team-id-match");
    expect(c?.severity).toBe("fail");
  });

  it("fails when services id mismatches between local and convex", async () => {
    const ctx = emptyContext({
      envLocal: new Map([["APPLE_SERVICES_ID", "com.foo.signin"]]),
      convexEnv: new Map([["APPLE_CLIENT_ID", "com.bar.signin"]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "services-id-match");
    expect(c?.severity).toBe("fail");
  });

  it("warns when app name in convex differs from app.config.ts", async () => {
    const ctx = emptyContext({
      convexEnv: new Map([["APP_NAME", "OldName"]]),
      appConfig: { name: "NewName" },
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "app-name-match");
    expect(c?.severity).toBe("warn");
  });

  it("accepts ' (Dev)' suffix on dev channel (IS_DEV branching)", async () => {
    const ctx = emptyContext({
      channel: "dev",
      convexEnv: new Map([["APP_NAME", "Vexpo (Dev)"]]),
      appConfig: { name: "Vexpo" },
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "app-name-match");
    expect(c?.severity).toBe("ok");
  });

  it("accepts ' Dev' suffix on dev channel", async () => {
    const ctx = emptyContext({
      channel: "dev",
      convexEnv: new Map([["APP_NAME", "Vexpo Dev"]]),
      appConfig: { name: "Vexpo" },
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "app-name-match");
    expect(c?.severity).toBe("ok");
  });

  it("rejects ' (Dev)' suffix on prod channel", async () => {
    const ctx = emptyContext({
      channel: "prod",
      convexProdEnv: new Map([["APP_NAME", "Vexpo (Dev)"]]),
      appConfig: { name: "Vexpo" },
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "app-name-match");
    expect(c?.severity).toBe("warn");
  });
});

describe("Convex deployment checks", () => {
  it("checks deployment-reachable status", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount += 1;
      if (url.includes("convex.cloud")) {
        return new Response("", { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const ctx = emptyContext({
      envLocal: new Map([["EXPO_PUBLIC_CONVEX_URL", "https://happy-frog-12.convex.cloud"]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "deployment-reachable");
    expect(c?.severity).toBe("ok");
    expect(callCount).toBeGreaterThan(0);
  });

  it("warns when site URL slug differs from cloud URL slug", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    const ctx = emptyContext({
      envLocal: new Map([
        ["EXPO_PUBLIC_CONVEX_URL", "https://foo-12.convex.cloud"],
        ["EXPO_PUBLIC_CONVEX_SITE_URL", "https://bar-99.convex.site"],
      ]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "site-cloud-match");
    expect(c?.severity).toBe("warn");
  });

  it("warns when BETTER_AUTH_SECRET is too short", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    const tooShort = Buffer.from("a".repeat(8)).toString("base64");
    const ctx = emptyContext({
      convexEnv: new Map([["BETTER_AUTH_SECRET", tooShort]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "better-auth-secret");
    expect(c?.severity).toBe("warn");
  });
});

// A null env map means the read itself failed (deploy-key auth, offline).
// Doctor must say "unreadable", never fail vars as unset: a live prod
// channel showed `better-auth-secret not set` for a secret that was set.
describe("unreadable Convex env", () => {
  beforeEach(() => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch;
  });

  it("warns env-read on prod instead of failing per-var checks", async () => {
    const ctx = emptyContext({ channel: "prod", convexProdEnv: null });
    const checks = await verifyAll(ctx);
    expect(checks.find((c) => c.name === "env-read")?.severity).toBe("warn");
    expect(checks.find((c) => c.name === "better-auth-secret")).toBeUndefined();
    expect(checks.find((c) => c.name === "api-key-set")?.severity).toBe("skip");
    expect(checks.find((c) => c.name === "convex-env")?.severity).toBe("skip");
  });

  it("treats a failed dev read the same way", async () => {
    const ctx = emptyContext({ convexEnv: null });
    const checks = await verifyAll(ctx);
    expect(checks.find((c) => c.name === "env-read")?.severity).toBe("warn");
    expect(checks.find((c) => c.name === "better-auth-secret")).toBeUndefined();
  });
});

describe("Resend checks", () => {
  it("fails when API key returns invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () => new Response("Unauthorized", { status: 401 }),
      ) as unknown as typeof fetch;
    const ctx = emptyContext({
      convexEnv: new Map([["RESEND_API_KEY", "re_bad"]]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "api-key-valid");
    expect(c?.severity).toBe("fail");
  });

  it("warns when EMAIL_FROM domain not in Resend domains", async () => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      call += 1;
      if (url.endsWith("/api-keys")) return new Response("[]", { status: 200 });
      if (url.endsWith("/domains"))
        return new Response(
          JSON.stringify({ data: [{ id: "d1", name: "verified.com", status: "verified" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      if (url.endsWith("/webhooks")) return new Response('{"data":[]}', { status: 200 });
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const ctx = emptyContext({
      convexEnv: new Map([
        ["RESEND_API_KEY", "re_full"],
        ["EMAIL_FROM", "team@otherdomain.com"],
      ]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "email-from-domain");
    expect(c?.severity).toBe("warn");
    expect(c?.message).toContain("otherdomain.com");
  });

  it("warns when webhook is not pointing at the convex site", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/api-keys")) return new Response("[]", { status: 200 });
      if (url.endsWith("/domains"))
        return new Response(
          JSON.stringify({ data: [{ id: "d1", name: "ours.com", status: "verified" }] }),
          { status: 200 },
        );
      if (url.endsWith("/webhooks"))
        return new Response(
          JSON.stringify({
            data: [{ id: "w1", endpoint: "https://different.com/hook", status: "enabled" }],
          }),
          { status: 200 },
        );
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const ctx = emptyContext({
      envLocal: new Map([["EXPO_PUBLIC_CONVEX_SITE_URL", "https://x.convex.site"]]),
      convexEnv: new Map([
        ["RESEND_API_KEY", "re_full"],
        ["EMAIL_FROM", "team@ours.com"],
      ]),
    });
    const checks = await verifyAll(ctx);
    const c = checks.find((x) => x.name === "webhook-endpoint");
    expect(c?.severity).toBe("warn");
  });
});

describe("readAppConfigFacts", () => {
  it("leaves name unset when app.config.ts declares no parseable name", async () => {
    // A customized config that computes its name dynamically declares no literal
    // name. Falling back to the title-cased pkg slug here would make the coherence
    // check warn on a name verify never actually read from app.config.ts.
    await writeFile("package.json", JSON.stringify({ name: "my-cool-app" }));
    await writeFile("app.config.ts", `export default { name: pkg.displayName };`);
    const facts = await readAppConfigFacts();
    expect(facts.name).toBeUndefined();
  });

  it("reads the name declared via the template IS_DEV ternary", async () => {
    await writeFile("app.config.ts", `export default { name: IS_DEV ? "Vexpo (Dev)" : "Vexpo" };`);
    const facts = await readAppConfigFacts();
    expect(facts.name).toBe("Vexpo");
  });
});

describe("summarize", () => {
  it("counts severities", () => {
    const checks = [
      { category: "convex", name: "a", severity: "ok", message: "" },
      { category: "convex", name: "b", severity: "ok", message: "" },
      { category: "apple", name: "c", severity: "warn", message: "" },
      { category: "apple", name: "d", severity: "fail", message: "" },
      { category: "eas", name: "e", severity: "skip", message: "" },
    ] as const;
    expect(summarize(checks as never)).toEqual({ ok: 2, warn: 1, fail: 1, skip: 1 });
  });
});
