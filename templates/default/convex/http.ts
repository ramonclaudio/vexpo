import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { resend } from "./email";
import { log, newRequestId } from "./log";
import { withWebhook } from "./webhook";

const http = httpRouter();

authComponent.registerRoutesLazy(http, createAuth);

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
