import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { withWebhook } from "@/convex/webhook";

// Stub Convex action context. The webhook factory doesn't use it (the inner
// handler does, if it needs to call queries/mutations), so an empty object
// satisfies the type for these unit tests. Cast through `unknown` rather than
// importing the Convex generic action type, which would bloat the test deps.
const ctx = {} as unknown as Parameters<ReturnType<typeof withWebhook>>[0];

async function sign(algorithm: "sha1" | "sha256", secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: algorithm === "sha1" ? "SHA-1" : "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeRequest(opts: {
  body: string;
  signatureHeader: string;
  signatureValue?: string;
  timestampHeader?: string;
  timestampValue?: string;
  contentLength?: number;
}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.signatureValue) headers[opts.signatureHeader] = opts.signatureValue;
  if (opts.timestampHeader && opts.timestampValue)
    headers[opts.timestampHeader] = opts.timestampValue;
  if (opts.contentLength !== undefined) headers["Content-Length"] = String(opts.contentLength);
  return new Request("https://example.convex.site/webhook", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

describe("withWebhook (HMAC signature verification)", () => {
  const SECRET = "test-secret-do-not-rotate";

  beforeEach(() => {
    process.env.TEST_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.TEST_WEBHOOK_SECRET;
  });

  test("503 when secret env var is unset", async () => {
    delete process.env.TEST_WEBHOOK_SECRET;
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      () => new Response("ok"),
    );
    const res = await handler(ctx, makeRequest({ body: "{}", signatureHeader: "x-signature" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  test("401 when signature header is missing", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      () => new Response("ok"),
    );
    const res = await handler(ctx, makeRequest({ body: "{}", signatureHeader: "x-signature" }));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("missing x-signature");
  });

  test("401 when signature does not match", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      () => new Response("ok"),
    );
    const res = await handler(
      ctx,
      makeRequest({
        body: "{}",
        signatureHeader: "x-signature",
        signatureValue: "deadbeef",
      }),
    );
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("signature mismatch");
  });

  test("200 when signature matches (SHA-256)", async () => {
    const body = JSON.stringify({ event: "test.ping" });
    const signature = await sign("sha256", SECRET, body);
    let handlerCalled = false;
    const handler = withWebhook<{ event: string }>(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      (_ctx, payload) => {
        handlerCalled = true;
        return new Response(JSON.stringify({ ok: true, received: payload.event }), { status: 200 });
      },
    );
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
      }),
    );
    expect(res.status).toBe(200);
    expect(handlerCalled).toBe(true);
    const json = (await res.json()) as { ok: boolean; received: string };
    expect(json.received).toBe("test.ping");
  });

  test("200 when signature matches with prefix (SHA-1, EAS-style)", async () => {
    const body = JSON.stringify({ status: "finished" });
    const signature = `sha1=${await sign("sha1", SECRET, body)}`;
    const handler = withWebhook(
      {
        source: "eas-webhook",
        signatureHeader: "expo-signature",
        signaturePrefix: "sha1=",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha1",
      },
      () => new Response("ok", { status: 200 }),
    );
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "expo-signature",
        signatureValue: signature,
      }),
    );
    expect(res.status).toBe(200);
  });

  test("400 when body is not valid JSON", async () => {
    const body = "not-json{";
    const signature = await sign("sha256", SECRET, body);
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      () => new Response("ok"),
    );
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("413 when Content-Length exceeds maxBodyBytes", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
        maxBodyBytes: 100,
      },
      () => new Response("ok"),
    );
    const res = await handler(
      ctx,
      makeRequest({
        body: "{}",
        signatureHeader: "x-signature",
        signatureValue: "deadbeef",
        contentLength: 999_999,
      }),
    );
    expect(res.status).toBe(413);
  });

  test("413 while streaming when a body with no content-length exceeds the cap", async () => {
    // No content-length header, so the up-front check is bypassed and the cap is
    // enforced while reading. The reader must cancel once it crosses the cap
    // instead of buffering the whole body; the stub stream errors if pulled a
    // third time (past the two chunks needed to cross a 100-byte cap).
    let canceled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls > 2) {
          controller.error(new Error("read past the cap"));
          return;
        }
        controller.enqueue(new Uint8Array(60));
      },
      cancel() {
        canceled = true;
      },
    });

    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
        maxBodyBytes: 100,
      },
      () => new Response("ok"),
    );
    const req = new Request("https://example.convex.site/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-signature": "deadbeef" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const res = await handler(ctx, req);
    expect(res.status).toBe(413);
    expect(canceled).toBe(true);
  });

  test("401 when replay timestamp is missing", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
        replay: { header: "x-timestamp", maxAgeSeconds: 300 },
      },
      () => new Response("ok"),
    );
    const body = "{}";
    const signature = await sign("sha256", SECRET, body);
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
      }),
    );
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("missing x-timestamp");
  });

  test("401 when replay timestamp is stale", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
        replay: { header: "x-timestamp", maxAgeSeconds: 60 },
      },
      () => new Response("ok"),
    );
    const body = "{}";
    const signature = await sign("sha256", SECRET, body);
    const stale = Date.now() - 120_000; // 2 minutes ago, exceeds 60s window
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
        timestampHeader: "x-timestamp",
        timestampValue: String(stale),
      }),
    );
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("timestamp out of window");
  });

  test("200 when replay timestamp is fresh", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
        replay: { header: "x-timestamp", maxAgeSeconds: 300 },
      },
      () => new Response("ok", { status: 200 }),
    );
    const body = "{}";
    const signature = await sign("sha256", SECRET, body);
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
        timestampHeader: "x-timestamp",
        timestampValue: String(Date.now()),
      }),
    );
    expect(res.status).toBe(200);
  });

  test("401 when replay timestamp is in the future", async () => {
    // The window is two-sided (Math.abs of the age), so a forward-skewed clock
    // is rejected too. A one-sided `age > max` check would pass every other
    // replay test but accept arbitrarily-future timestamps; this pins that.
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
        replay: { header: "x-timestamp", maxAgeSeconds: 60 },
      },
      () => new Response("ok"),
    );
    const body = "{}";
    const signature = await sign("sha256", SECRET, body);
    const future = Date.now() + 120_000; // 2 minutes ahead, exceeds 60s window
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
        timestampHeader: "x-timestamp",
        timestampValue: String(future),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("timestamp out of window");
  });

  test("X-Request-Id header is set on every response", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      () => new Response("ok", { status: 200 }),
    );
    const body = "{}";
    const signature = await sign("sha256", SECRET, body);
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  test("500 when handler throws", async () => {
    const handler = withWebhook(
      {
        source: "test",
        signatureHeader: "x-signature",
        secretEnv: "TEST_WEBHOOK_SECRET",
        algorithm: "sha256",
      },
      () => {
        throw new Error("simulated handler crash");
      },
    );
    const body = "{}";
    const signature = await sign("sha256", SECRET, body);
    const res = await handler(
      ctx,
      makeRequest({
        body,
        signatureHeader: "x-signature",
        signatureValue: signature,
      }),
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("handler error");
  });
});
