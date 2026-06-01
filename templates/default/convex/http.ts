import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { resend } from "./email";
import { log, newRequestId } from "./log";
import { withWebhook } from "./webhook";

const http = httpRouter();

// Register Better Auth routes lazily so Better Auth is not initialized at
// module load. Reduces http.ts memory footprint during `convex deploy`.
authComponent.registerRoutesLazy(http, createAuth);

// Resend delivery events webhook. `@convex-dev/resend` ships its own Svix
// signature verification + idempotency, so we just forward the raw request.
// Configure the Resend dashboard webhook at
// https://<your-deployment>.convex.site/resend-webhook and set
// RESEND_WEBHOOK_SECRET on the Convex deployment.
// `@convex-dev/resend`'s `handleResendEventWebhook` throws if
// `RESEND_WEBHOOK_SECRET` is unset, and Convex's default error handling
// serializes the stack trace into the 503 body (including absolute-ish
// module paths). Wrap to short-circuit with a clean 503 before the library
// runs, and wrap the library call itself so its other internal errors don't
// leak source paths either.
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!process.env.RESEND_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "RESEND_WEBHOOK_SECRET not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      return await resend.handleResendEventWebhook(ctx, req);
    } catch (err) {
      log.warn({
        event: "resend.handler_error",
        message: err instanceof Error ? err.message : String(err),
      });
      return new Response(JSON.stringify({ error: "webhook handler error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// EAS Build / Submit webhook receiver.
//
// Wire it up once with:
//   npx eas webhook:create --event BUILD  --url https://<your-deployment>.convex.site/eas-webhook --secret <strong-secret>
//   npx eas webhook:create --event SUBMIT --url https://<your-deployment>.convex.site/eas-webhook --secret <strong-secret>
//   npx convex env set EAS_WEBHOOK_SECRET <strong-secret>
//
// Per https://docs.expo.dev/eas/webhooks/, EAS signs every POST with
// HMAC-SHA1 in `expo-signature: sha1=<hex>`. The factory below handles
// the signature + body cap + structured access log; the handler here just
// dispatches on payload shape.
type EasWebhookPayload = {
  id?: string;
  status?: string;
  platform?: string;
  buildDetailsPageUrl?: string;
  appId?: string;
  metadata?: { appName?: string };
};

http.route({
  path: "/eas-webhook",
  method: "POST",
  handler: httpAction(
    withWebhook<EasWebhookPayload>(
      {
        source: "eas-webhook",
        signatureHeader: "expo-signature",
        signaturePrefix: "sha1=",
        secretEnv: "EAS_WEBHOOK_SECRET",
        algorithm: "sha1",
      },
      (_ctx, payload, { requestId }) => {
        log.info({
          event: "eas.received",
          requestId,
          easId: payload.id,
          platform: payload.platform,
          status: payload.status,
          appName: payload.metadata?.appName,
          detailsUrl: payload.buildDetailsPageUrl,
        });
        return new Response(JSON.stringify({ ok: true, requestId }), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        });
      },
    ),
  ),
});

// Apple universal link association file.
//
// Served on every cold-launch of every installed copy of the app. high
// fanout, fully static body, cheapest possible payload wins. We:
//   1. Construct the body deterministically from env so the ETag is stable.
//   2. Cache for 1h with `must-revalidate` so a bundle-id change still
//      converges within that window. Apple itself caches AASA aggressively
//      on-device; the public CDN cache is the only tier that matters for
//      first-install latency.
//   3. Honor conditional GETs (`If-None-Match`) with 304s so warm callers
//      pay only the round-trip.
// `appID` is `<APPLE_TEAM_ID>.<BUNDLE_ID>`. Both env vars are pushed to
// the Convex deployment by `setup:convex` (or `setup:apple`).
http.route({
  path: "/.well-known/apple-app-site-association",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const requestId = newRequestId();
    const teamId = process.env.APPLE_TEAM_ID;
    const bundleId = process.env.APP_BUNDLE_ID;
    if (!teamId || !bundleId) {
      log.error({
        event: "aasa.misconfigured",
        requestId,
        hasTeamId: !!teamId,
        hasBundleId: !!bundleId,
      });
      return jsonError(503, "APPLE_TEAM_ID and APP_BUNDLE_ID must be set", requestId);
    }
    const body = JSON.stringify({
      applinks: {
        details: [{ appID: `${teamId}.${bundleId}`, paths: ["*"] }],
      },
    });
    const etag = `"${await sha256Hex(body)}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      log.info({ event: "aasa.not_modified", requestId });
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=3600, must-revalidate",
          "X-Request-Id": requestId,
        },
      });
    }
    log.info({ event: "aasa.served", requestId, bytes: body.length });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, must-revalidate",
        ETag: etag,
        "X-Request-Id": requestId,
      },
    });
  }),
});

async function sha256Hex(s: string): Promise<string> {
  const sig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonError(status: number, message: string, requestId: string): Response {
  return new Response(JSON.stringify({ error: message, requestId }), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
  });
}

export default http;
