import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { resend } from "./email";

const http = httpRouter();

authComponent.registerRoutesLazy(http, createAuth);

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction((ctx, req) => resend.handleResendEventWebhook(ctx, req)),
});

http.route({
  path: "/.well-known/apple-app-site-association",
  method: "GET",
  handler: httpAction(async () => {
    const teamId = process.env.APPLE_TEAM_ID;
    const bundleId = process.env.APP_BUNDLE_ID;
    if (!teamId || !bundleId) {
      return new Response(
        JSON.stringify({ error: "APPLE_TEAM_ID and APP_BUNDLE_ID must be set" }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({ applinks: { details: [{ appID: `${teamId}.${bundleId}`, paths: ["*"] }] } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
      },
    );
  }),
});

export default http;
