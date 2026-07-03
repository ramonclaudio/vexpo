import type { GenericActionCtx } from "convex/server";

import { log, newRequestId } from "./log";

export type SignatureAlgorithm = "sha1" | "sha256";

export type WithWebhookOptions = {
  source: string;
  signatureHeader: string;
  secretEnv: string;
  /** HMAC algorithm. EAS signs with SHA-1. */
  algorithm: SignatureAlgorithm;
  /** Prefix before the hex digest. EAS sends `sha1=<hex>`. Default `""`. */
  signaturePrefix?: string;
  maxBodyBytes?: number;
  replay?: {
    header: string;
    maxAgeSeconds: number;
  };
};

export type WebhookContext = {
  requestId: string;
  rawBody: string;
};

export type WebhookHandler<T> = (
  ctx: GenericActionCtx<Record<string, never>>,
  payload: T,
  webhookCtx: WebhookContext,
) => Promise<Response> | Response;

export function withWebhook<T = unknown>(
  opts: WithWebhookOptions,
  handler: WebhookHandler<T>,
): (ctx: GenericActionCtx<Record<string, never>>, req: Request) => Promise<Response> {
  const maxBodyBytes = opts.maxBodyBytes ?? 1024 * 1024;
  const prefix = opts.signaturePrefix ?? "";

  return async (ctx, req) => {
    const start = Date.now();
    const requestId = newRequestId();
    const baseFields = { event: "webhook", requestId, source: opts.source };

    const secret = process.env[opts.secretEnv];
    if (!secret) {
      log.error({ ...baseFields, event: "webhook.misconfigured", secretEnv: opts.secretEnv });
      return jsonError(503, "webhook secret not configured", requestId);
    }

    const signatureHeaderValue = req.headers.get(opts.signatureHeader);
    if (!signatureHeaderValue) {
      log.warn({ ...baseFields, event: "webhook.missing_signature" });
      return jsonError(401, `missing ${opts.signatureHeader}`, requestId);
    }

    if (opts.replay) {
      const tsHeader = req.headers.get(opts.replay.header);
      if (!tsHeader) {
        log.warn({ ...baseFields, event: "webhook.missing_timestamp" });
        return jsonError(401, `missing ${opts.replay.header}`, requestId);
      }
      const ts = Number(tsHeader);
      if (!Number.isFinite(ts)) {
        log.warn({ ...baseFields, event: "webhook.bad_timestamp", tsHeader });
        return jsonError(401, "bad timestamp", requestId);
      }
      const ageSeconds = (Date.now() - ts) / 1000;
      if (Math.abs(ageSeconds) > opts.replay.maxAgeSeconds) {
        log.warn({ ...baseFields, event: "webhook.stale", ageSeconds });
        return jsonError(401, "timestamp out of window", requestId);
      }
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > maxBodyBytes) {
      log.warn({ ...baseFields, event: "webhook.too_large", contentLength });
      return jsonError(413, "payload too large", requestId);
    }

    const rawBody = await readCappedBody(req, maxBodyBytes);
    if (rawBody === null) {
      log.warn({ ...baseFields, event: "webhook.too_large", maxBodyBytes });
      return jsonError(413, "payload too large", requestId);
    }

    const computed = prefix + (await hmacHex(opts.algorithm, secret, rawBody));
    if (!timingSafeEqual(computed, signatureHeaderValue)) {
      log.warn({ ...baseFields, event: "webhook.bad_signature" });
      return jsonError(401, "signature mismatch", requestId);
    }

    let payload: T;
    try {
      payload = JSON.parse(rawBody) as T;
    } catch {
      log.warn({ ...baseFields, event: "webhook.bad_json" });
      return jsonError(400, "invalid json", requestId);
    }

    try {
      const response = await handler(ctx, payload, { requestId, rawBody });
      log.info({
        ...baseFields,
        event: "webhook.ok",
        status: response.status,
        durationMs: Date.now() - start,
      });
      if (!response.headers.get("X-Request-Id")) {
        const headers = new Headers(response.headers);
        headers.set("X-Request-Id", requestId);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    } catch (err) {
      log.error({
        ...baseFields,
        event: "webhook.handler_error",
        durationMs: Date.now() - start,
        err,
      });
      return jsonError(500, "handler error", requestId);
    }
  };
}

function jsonError(status: number, message: string, requestId: string): Response {
  return new Response(JSON.stringify({ error: message, requestId }), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
  });
}

// Read the body while enforcing the byte cap, aborting the stream past the
// limit so an oversized or content-length-lying client never buffers fully.
async function readCappedBody(req: Request, maxBytes: number): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) {
    const buf = await req.arrayBuffer();
    return buf.byteLength > maxBytes ? null : new TextDecoder().decode(buf);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function hmacHex(
  algorithm: SignatureAlgorithm,
  secret: string,
  body: string,
): Promise<string> {
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
