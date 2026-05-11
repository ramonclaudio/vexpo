import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AscApiError,
  SIGN_IN_WITH_APPLE_CAPABILITY,
  makeAscClient,
  validate,
  type AscBundleId,
} from "../../src/lib/asc-api";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const creds = {
  issuerId: "00000000-0000-0000-0000-000000000000",
  keyId: "ABCDE12345",
  privateKey: { contents: pem },
};

type FetchMock = ReturnType<typeof vi.fn>;
let fetchSpy: FetchMock;

beforeEach(() => {
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeJson(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeEmpty(status: number, headers: Record<string, string> = {}): Response {
  return new Response("", { status, headers });
}

function alwaysJson(status: number, body: unknown, headers?: Record<string, string>): void {
  fetchSpy.mockImplementation(async () => makeJson(status, body, headers));
}

describe("AscApiError", () => {
  it("parses an ASC error envelope", () => {
    const body = JSON.stringify({
      errors: [{ status: "401", code: "NOT_AUTHORIZED", title: "Bad token", detail: "expired" }],
    });
    const err = new AscApiError(401, body);
    expect(err.status).toBe(401);
    expect(err.code).toBe("NOT_AUTHORIZED");
    expect(err.detail).toBe("expired");
    expect(err.message).toContain("expired");
  });

  it("falls back to raw body when JSON parsing fails", () => {
    const err = new AscApiError(500, "<html>");
    expect(err.message).toContain("<html>");
    expect(err.code).toBeUndefined();
  });
});

describe("AscClient request encoding", () => {
  it("encodes filters with bracket syntax", async () => {
    alwaysJson(200, { data: [], links: {} });
    const client = makeAscClient(creds);
    await client.bundleIds.list({ identifier: "com.example.app", platform: "IOS" });
    const url = (fetchSpy.mock.calls[0]?.[0] ?? "") as string;
    expect(url).toContain("filter%5Bidentifier%5D=com.example.app");
    expect(url).toContain("filter%5Bplatform%5D=IOS");
  });

  it("sends the bearer token", async () => {
    alwaysJson(200, { data: [] });
    const client = makeAscClient(creds);
    await client.apps.list();
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^Bearer eyJ/);
  });

  it("memoizes the token across calls in the same client", async () => {
    alwaysJson(200, { data: [] });
    const client = makeAscClient(creds);
    await client.apps.list();
    await client.apps.list();
    await client.apps.list();
    const tokens = fetchSpy.mock.calls.map((c) => {
      const init = c[1] as RequestInit | undefined;
      return (init?.headers as Record<string, string> | undefined)?.Authorization;
    });
    expect(new Set(tokens).size).toBe(1);
  });
});

describe("retry policy", () => {
  it("retries on 429 with Retry-After then succeeds", async () => {
    let call = 0;
    fetchSpy.mockImplementation(async () => {
      call += 1;
      if (call === 1) return makeEmpty(429, { "retry-after": "0" });
      if (call === 2) return makeEmpty(503);
      return makeJson(200, { data: [] });
    });
    const client = makeAscClient(creds);
    await client.apps.list();
    expect(call).toBeGreaterThanOrEqual(3);
  });

  it("does not retry on 4xx other than 429", async () => {
    alwaysJson(422, { errors: [{ status: "422", code: "ENTITY_ERROR", detail: "bad" }] });
    const client = makeAscClient(creds);
    await expect(
      client.bundleIds.create({ identifier: "x", name: "y", platform: "IOS" }),
    ).rejects.toBeInstanceOf(AscApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-signs once on 401 then bails", async () => {
    alwaysJson(401, { errors: [{ status: "401", code: "NOT_AUTHORIZED" }] });
    const client = makeAscClient(creds);
    await expect(client.apps.list()).rejects.toBeInstanceOf(AscApiError);
    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});

describe("bundleIds + capabilities", () => {
  it("creates a Services ID via POST /v1/bundleIds", async () => {
    const created: AscBundleId = {
      type: "bundleIds",
      id: "abc",
      attributes: {
        identifier: "com.example.signin",
        name: "Example Sign In",
        platform: "SERVICES",
      },
    };
    alwaysJson(201, { data: created });
    const client = makeAscClient(creds);
    const out = await client.bundleIds.create({
      identifier: "com.example.signin",
      name: "Example Sign In",
      platform: "SERVICES",
    });
    expect(out.id).toBe("abc");
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe("bundleIds");
    expect(body.data.attributes.platform).toBe("SERVICES");
  });

  it("attaches a SIWA capability via POST /v1/bundleIdCapabilities", async () => {
    alwaysJson(201, {
      data: {
        type: "bundleIdCapabilities",
        id: "cap-1",
        attributes: { capabilityType: "APPLE_ID_AUTH" },
      },
    });
    const client = makeAscClient(creds);
    const out = await client.bundleIdCapabilities.create({
      bundleIdResourceId: "abc",
      capabilityType: SIGN_IN_WITH_APPLE_CAPABILITY,
    });
    expect(out.attributes.capabilityType).toBe("APPLE_ID_AUTH");
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.data.relationships.bundleId.data.id).toBe("abc");
  });

  it("lists capabilities without sending the rejected `limit` param", async () => {
    // Apple's relationship endpoints reject the `limit` query param now.
    // The list call should hit /v1/bundleIds/<id>/bundleIdCapabilities with
    // no limit added.
    alwaysJson(200, { data: [] });
    const client = makeAscClient(creds);
    await client.bundleIdCapabilities.list("abc");
    const url = (fetchSpy.mock.calls[0]?.[0] ?? "") as string;
    expect(url).toContain("/v1/bundleIds/abc/bundleIdCapabilities");
    expect(url).not.toContain("limit=");
    expect(url).not.toContain("limit%3D");
  });
});

describe("validate", () => {
  it("returns ok=true on a successful apps.list", async () => {
    alwaysJson(200, { data: [] });
    const result = await validate(creds);
    expect(result.ok).toBe(true);
  });

  it("maps 401 to a descriptive reason", async () => {
    alwaysJson(401, { errors: [{ status: "401", code: "NOT_AUTHORIZED" }] });
    const result = await validate(creds);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toContain("invalid token");
    }
  });

  it("maps 403 to insufficient role", async () => {
    alwaysJson(403, { errors: [{ status: "403", code: "FORBIDDEN" }] });
    const result = await validate(creds);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.reason).toContain("role insufficient");
    }
  });

  it("treats an empty app list as ok (new dev account)", async () => {
    alwaysJson(200, { data: [] });
    const result = await validate(creds);
    if (result.ok) expect(result.appCount).toBe(0);
    else expect.fail("expected ok=true");
  });
});
