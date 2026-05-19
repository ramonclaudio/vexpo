/**
 * Verification engine for setup-lite and setup-verify. Runs a battery of
 * checks across local files, Convex env, EAS env, GitHub secrets, and
 * external service auth (Resend, ASC, Apple JWT) to make sure:
 *
 *   1. Credentials authenticate (Resend key works, ASC key works, JWT
 *      decodes correctly).
 *   2. Credentials match the project (bundle id, team id, services id,
 *      Convex deployment URLs all line up across .env.local, Convex env,
 *      EAS env, app.config.ts).
 *   3. Time-sensitive credentials are still fresh (Apple JWT expires in
 *      <30 days warns).
 *
 * Pure logic. no I/O outside fetch + the existing CLI shellouts. Returns
 * Check[] for the caller to format. Never throws on failed checks. they
 * become Check objects with severity "fail" or "warn".
 */

import { validate as ascValidate, makeAscClient, type AscCredentials } from "./asc-api.ts";
import { envMap as convexEnvMap, type ConvexTarget } from "./convex-env.ts";
import {
  diagnostics as easDiagnostics,
  envList as easEnvList,
  projectIdFromAppJson,
  projectInfo as easProjectInfo,
  whoami as easWhoami,
} from "./eas-env.ts";
import { readEnvFile } from "./env-files.ts";
import { listDomains, listWebhooks, probeAccess } from "./resend-api.ts";
import { load as loadState } from "./state.ts";

export type Severity = "ok" | "warn" | "fail" | "skip";

export type Category = "convex" | "resend" | "apple" | "eas" | "coherence" | "files";

export type Check = {
  category: Category;
  name: string;
  severity: Severity;
  message: string;
  details?: string;
};

export type Channel = "dev" | "prod";

export type VerifyContext = {
  channel: Channel;
  envLocal: Map<string, string>;
  envProd: Map<string, string>;
  convexEnv: Map<string, string>;
  convexProdEnv: Map<string, string>;
  appConfig: AppConfigFacts;
  storeConfig?: StoreConfigFacts;
  ascCreds: AscCredentials | null;
};

export type AppConfigFacts = {
  name?: string;
  bundleIdFallback?: string;
  teamIdFallback?: string;
  scheme?: string;
};

export type StoreConfigFacts = {
  reviewEmail?: string;
};

const ok = (category: Category, name: string, message: string, details?: string): Check => ({
  category,
  name,
  severity: "ok",
  message,
  details,
});

const warn = (category: Category, name: string, message: string, details?: string): Check => ({
  category,
  name,
  severity: "warn",
  message,
  details,
});

const fail = (category: Category, name: string, message: string, details?: string): Check => ({
  category,
  name,
  severity: "fail",
  message,
  details,
});

const skip = (category: Category, name: string, message: string, details?: string): Check => ({
  category,
  name,
  severity: "skip",
  message,
  details,
});

// ---------- helpers ----------

function decodeJwt(
  jwt: string,
): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], "base64url").toString()),
      payload: JSON.parse(Buffer.from(parts[1], "base64url").toString()),
    };
  } catch {
    return null;
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function deploymentSlugFromHost(host: string): string | null {
  // happy-frog-12.convex.cloud → happy-frog-12
  const m = /^([a-z0-9-]+)\.convex\.(cloud|site)$/i.exec(host);
  return m ? m[1] : null;
}

async function fetchOk(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status: number }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, method: "HEAD" });
    return { ok: res.ok || res.status === 405, status: res.status }; // 405 = HEAD not allowed but server is up
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Convex ----------

async function verifyConvex(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  const env = ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;

  const cloudUrl = local.get("EXPO_PUBLIC_CONVEX_URL");
  const siteUrl = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");

  if (cloudUrl) {
    const reach = await fetchOk(cloudUrl);
    if (reach.ok)
      checks.push(ok("convex", "deployment-reachable", `${cloudUrl} → ${reach.status}`));
    else
      checks.push(
        fail("convex", "deployment-reachable", `${cloudUrl} unreachable (status ${reach.status})`),
      );
  } else {
    checks.push(skip("convex", "deployment-reachable", "no EXPO_PUBLIC_CONVEX_URL"));
  }

  if (cloudUrl && siteUrl) {
    const cloud = hostnameOf(cloudUrl);
    const site = hostnameOf(siteUrl);
    if (cloud && site) {
      const cloudSlug = deploymentSlugFromHost(cloud);
      const siteSlug = deploymentSlugFromHost(site);
      if (cloudSlug && siteSlug && cloudSlug === siteSlug) {
        checks.push(ok("convex", "site-cloud-match", `slug=${cloudSlug}`));
      } else if (cloudSlug && siteSlug) {
        checks.push(
          warn(
            "convex",
            "site-cloud-match",
            `cloud=${cloudSlug} ≠ site=${siteSlug} (different deployments?)`,
          ),
        );
      }
    }
  }

  const secret = env.get("BETTER_AUTH_SECRET");
  if (secret) {
    try {
      const bytes = Buffer.from(secret, "base64");
      if (bytes.length >= 32) checks.push(ok("convex", "better-auth-secret", `${bytes.length}b`));
      else
        checks.push(
          warn(
            "convex",
            "better-auth-secret",
            `BETTER_AUTH_SECRET is only ${bytes.length}b (32+ recommended)`,
          ),
        );
    } catch {
      checks.push(fail("convex", "better-auth-secret", "BETTER_AUTH_SECRET not valid base64"));
    }
  } else {
    checks.push(fail("convex", "better-auth-secret", `not set on Convex (${ctx.channel})`));
  }

  return checks;
}

// ---------- Resend ----------

async function verifyResend(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  const env = ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
  const apiKey = env.get("RESEND_API_KEY");
  const emailFrom = env.get("EMAIL_FROM");
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const expectedSiteUrl = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");

  if (!apiKey) {
    // Lite mode marker: `REQUIRE_EMAIL_VERIFICATION` is unset, sign-up
    // auto-verifies, no Resend needed. Skip rather than fail.
    const requireEmailVerification = env.get("REQUIRE_EMAIL_VERIFICATION");
    if (!requireEmailVerification || requireEmailVerification === "false") {
      checks.push(skip("resend", "api-key-set", "lite mode (run `bunx vexpo full` to provision)"));
      return checks;
    }
    checks.push(fail("resend", "api-key-set", `RESEND_API_KEY not set on Convex (${ctx.channel})`));
    return checks;
  }

  const access = await probeAccess(apiKey);
  if (access === "invalid") {
    checks.push(fail("resend", "api-key-valid", "RESEND_API_KEY rejected by Resend"));
    return checks;
  }
  checks.push(ok("resend", "api-key-valid", `key authenticated (access=${access})`));

  let domains: { id: string; name: string; status: string }[] = [];
  let webhooks: { id: string; endpoint: string; status: string }[] = [];

  if (access === "full") {
    try {
      domains = await listDomains(apiKey);
    } catch (e) {
      checks.push(
        warn(
          "resend",
          "domains-readable",
          `couldn't list domains: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }
    try {
      webhooks = await listWebhooks(apiKey);
    } catch (e) {
      checks.push(
        warn(
          "resend",
          "webhooks-readable",
          `couldn't list webhooks: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }
  } else {
    checks.push(
      skip(
        "resend",
        "domain-coverage",
        `key is sending-restricted; can't enumerate domains/webhooks`,
      ),
    );
  }

  if (emailFrom) {
    const at = emailFrom.indexOf("@");
    if (at < 0) {
      checks.push(fail("resend", "email-from-valid", `EMAIL_FROM=${emailFrom} (no @)`));
    } else {
      const domain = emailFrom.slice(at + 1);
      if (domains.length > 0) {
        const match = domains.find((d) => d.name === domain);
        if (!match) {
          checks.push(
            warn(
              "resend",
              "email-from-domain",
              `EMAIL_FROM=${emailFrom} but '${domain}' not in Resend domains: ${domains
                .map((d) => d.name)
                .join(", ")}`,
            ),
          );
        } else if (match.status !== "verified") {
          checks.push(
            warn(
              "resend",
              "email-from-domain",
              `EMAIL_FROM domain '${domain}' status=${match.status} (not verified)`,
            ),
          );
        } else {
          checks.push(ok("resend", "email-from-domain", `${domain} verified`));
        }
      }
    }
  } else {
    checks.push(warn("resend", "email-from-set", `EMAIL_FROM not set on Convex (${ctx.channel})`));
  }

  if (expectedSiteUrl && webhooks.length > 0) {
    const expectedEndpoint = `${expectedSiteUrl.replace(/\/$/, "")}/resend-webhook`;
    const match = webhooks.find((w) => w.endpoint === expectedEndpoint);
    if (!match) {
      const others = webhooks.map((w) => w.endpoint).join(", ");
      checks.push(
        warn(
          "resend",
          "webhook-endpoint",
          `no webhook pointing at ${expectedEndpoint}`,
          others ? `existing: ${others}` : undefined,
        ),
      );
    } else if (match.status !== "enabled" && match.status !== "active") {
      checks.push(warn("resend", "webhook-endpoint", `webhook ${match.id} status=${match.status}`));
    } else {
      checks.push(ok("resend", "webhook-endpoint", `→ ${expectedEndpoint}`));
    }
    // Confirm subscription covers the 4 actionable failure events. Without
    // these, you don't learn when an address goes dead.
    if (match) {
      const required = ["email.bounced", "email.complained", "email.suppressed", "email.failed"];
      const events = (match as { events?: string[] }).events ?? [];
      const missing = required.filter((e) => !events.includes(e));
      if (missing.length === 0)
        checks.push(ok("resend", "webhook-events", `${required.length} actionable events covered`));
      else
        checks.push(
          warn(
            "resend",
            "webhook-events",
            `webhook missing ${missing.join(", ")}`,
            "re-run `bunx vexpo resend` to refresh subscription",
          ),
        );
    }
  }

  return checks;
}

// ---------- Apple ----------

async function verifyApple(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  const env = ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;

  const teamId = env.get("APPLE_TEAM_ID") ?? local.get("EXPO_PUBLIC_APPLE_TEAM_ID");
  const keyId = env.get("APPLE_KEY_ID");
  const servicesId = env.get("APPLE_CLIENT_ID") ?? local.get("APPLE_SERVICES_ID");
  const jwt = env.get("APPLE_CLIENT_SECRET");

  if (!teamId) checks.push(warn("apple", "team-id-set", "APPLE_TEAM_ID not set"));
  else if (!/^[A-Z0-9]{10}$/.test(teamId))
    checks.push(warn("apple", "team-id-format", `APPLE_TEAM_ID='${teamId}' not 10 alphanumeric`));

  if (keyId && !/^[A-Z0-9]{10}$/.test(keyId))
    checks.push(warn("apple", "key-id-format", `APPLE_KEY_ID='${keyId}' not 10 alphanumeric`));

  if (servicesId && !/^[a-z0-9.-]+$/i.test(servicesId))
    checks.push(warn("apple", "services-id-format", `APPLE_SERVICES_ID looks malformed`));

  if (jwt) {
    const decoded = decodeJwt(jwt);
    if (!decoded) {
      checks.push(fail("apple", "jwt-decode", "APPLE_CLIENT_SECRET is not a valid JWT"));
    } else {
      const { header, payload } = decoded;
      if (header.alg !== "ES256")
        checks.push(warn("apple", "jwt-alg", `JWT alg=${header.alg} (expected ES256)`));
      if (payload.aud !== "https://appleid.apple.com")
        checks.push(
          warn("apple", "jwt-aud", `JWT aud=${payload.aud} (expected https://appleid.apple.com)`),
        );
      const exp = typeof payload.exp === "number" ? payload.exp : 0;
      const now = Math.floor(Date.now() / 1000);
      const daysLeft = Math.floor((exp - now) / 86_400);
      if (exp <= now) checks.push(fail("apple", "jwt-expiry", `JWT expired ${-daysLeft}d ago`));
      else if (daysLeft < 30)
        checks.push(warn("apple", "jwt-expiry", `JWT expires in ${daysLeft}d (rotate soon)`));
      else checks.push(ok("apple", "jwt-expiry", `${daysLeft}d remaining`));

      if (header.kid && keyId && header.kid !== keyId)
        checks.push(
          fail(
            "apple",
            "jwt-kid-matches",
            `JWT.header.kid='${header.kid}' ≠ APPLE_KEY_ID='${keyId}'`,
          ),
        );
      else if (header.kid && keyId)
        checks.push(ok("apple", "jwt-kid-matches", header.kid as string));

      if (payload.iss && teamId && payload.iss !== teamId)
        checks.push(
          fail("apple", "jwt-iss-matches", `JWT.iss='${payload.iss}' ≠ APPLE_TEAM_ID='${teamId}'`),
        );
      else if (payload.iss && teamId)
        checks.push(ok("apple", "jwt-iss-matches", payload.iss as string));

      if (payload.sub && servicesId && payload.sub !== servicesId)
        checks.push(
          fail(
            "apple",
            "jwt-sub-matches",
            `JWT.sub='${payload.sub}' ≠ APPLE_SERVICES_ID='${servicesId}'`,
          ),
        );
      else if (payload.sub && servicesId)
        checks.push(ok("apple", "jwt-sub-matches", payload.sub as string));
    }
  } else {
    checks.push(
      skip("apple", "jwt-decode", "APPLE_CLIENT_SECRET not set (Apple Sign In disabled)"),
    );
  }

  if (ctx.ascCreds) {
    const v = await ascValidate(ctx.ascCreds);
    if (v.ok) {
      checks.push(ok("apple", "asc-key-valid", `${v.appCount} app${v.appCount === 1 ? "" : "s"}`));
      const client = makeAscClient(ctx.ascCreds);

      if (servicesId) {
        try {
          // Apple rejects `filter[platform]=SERVICES` on POST/list now.
          // Filter by identifier only; the result already uniquely identifies
          // the Services ID since identifiers are globally unique.
          const matches = await client.bundleIds.list({ identifier: servicesId });
          if (matches.length > 0)
            checks.push(ok("apple", "services-id-exists", `${servicesId} found in ASC`));
          else
            checks.push(
              fail(
                "apple",
                "services-id-exists",
                `${servicesId} not found in App Store Connect`,
                "run `bunx vexpo apple services-id` to provision it",
              ),
            );
        } catch (e) {
          checks.push(
            warn(
              "apple",
              "services-id-lookup",
              `ASC lookup failed: ${e instanceof Error ? e.message : e}`,
            ),
          );
        }
      }

      // Customer reviews left unanswered for >7 days. App Review guideline 5.6
      // explicitly asks developers to "treat customers with respect when
      // responding to their comments". neglected reviews are an operational
      // hygiene concern, not just an Apple-rule one.
      const bundleId =
        ctx.envLocal.get("EXPO_PUBLIC_APP_BUNDLE_ID") ??
        ctx.appConfig.bundleIdFallback ??
        undefined;
      if (bundleId) {
        try {
          const apps = await client.paginatedList<{ id: string }>(
            "/v1/apps",
            { "filter[bundleId]": bundleId },
            5,
          );
          const ascAppId = apps[0]?.id;
          if (ascAppId) {
            const { reviews: reviewsApi, unansweredOlderThan } = await import("./asc-reviews.ts");
            const all = await reviewsApi(client).customerReviews.list({
              appId: ascAppId,
              limit: 100,
            });
            const stale = unansweredOlderThan(all, 7);
            if (stale.length === 0)
              checks.push(ok("apple", "reviews-answered", "no stale reviews"));
            else
              checks.push(
                warn(
                  "apple",
                  "reviews-answered",
                  `${stale.length} review${stale.length === 1 ? "" : "s"} unanswered for >7 days`,
                  "run `vexpo reviews unanswered --days 7` to triage",
                ),
              );
          }
        } catch {
          checks.push(skip("apple", "reviews-answered", "could not query customer reviews"));
        }
      }
    } else {
      checks.push(fail("apple", "asc-key-valid", v.reason));
    }
  } else {
    checks.push(
      skip("apple", "asc-key-valid", "no cached ASC creds (run `bunx vexpo apple asc-key`)"),
    );
  }

  return checks;
}

// ---------- EAS ----------

async function verifyEas(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  let projectId: string | null = null;
  try {
    projectId = await projectIdFromAppJson();
  } catch {
    checks.push(skip("eas", "project-id", "couldn't read app.json"));
    return checks;
  }
  if (!projectId) {
    // Lite mode marker: `REQUIRE_EMAIL_VERIFICATION` unset on Convex
    // implies lite-mode setup, which doesn't run `eas init`. Skip rather
    // than fail.
    const env = ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
    const requireEmailVerification = env.get("REQUIRE_EMAIL_VERIFICATION");
    if (!requireEmailVerification || requireEmailVerification === "false") {
      checks.push(skip("eas", "project-id", "lite mode (run `bunx vexpo full` to init EAS)"));
      return checks;
    }
    checks.push(fail("eas", "project-id", "no projectId in app.json"));
    return checks;
  }
  checks.push(ok("eas", "project-id", projectId));

  let who: string | null = null;
  try {
    who = await easWhoami();
  } catch {
    checks.push(skip("eas", "signed-in", "eas CLI not available"));
    return checks;
  }
  if (!who) {
    checks.push(warn("eas", "signed-in", "not signed in (run `bunx eas login`)"));
    return checks;
  }
  checks.push(ok("eas", "signed-in", who));

  // Verify the projectId resolves on EAS via `eas project:info`. Catches:
  //  - project deleted on EAS but still in app.json
  //  - user logged into a different EAS account from when projectId was set
  //  - account-transferred project (slug or owner changed)
  try {
    const info = await easProjectInfo();
    if (info) {
      if (info.id === projectId) {
        checks.push(ok("eas", "project-info", info.fullName));
      } else {
        checks.push(
          fail(
            "eas",
            "project-info",
            `app.json projectId (${projectId}) doesn't match resolved project (${info.id})`,
            "run `vexpo eas` to re-link",
          ),
        );
      }
    } else {
      checks.push(
        warn(
          "eas",
          "project-info",
          "eas project:info failed (project may have been deleted or transferred)",
        ),
      );
    }
  } catch {
    checks.push(skip("eas", "project-info", "eas-cli not available"));
  }

  // Run `eas diagnostics` for a single shot of "is the CLI happy with this
  // project". Catches eas.json schema errors, missing project link, version
  // mismatches. Surfaced as one check; the eas-cli error tail is the message.
  try {
    const diag = await easDiagnostics();
    if (diag.ok) {
      checks.push(ok("eas", "diagnostics", "eas-cli health ok"));
    } else {
      checks.push(warn("eas", "diagnostics", diag.error));
    }
  } catch {
    checks.push(skip("eas", "diagnostics", "eas-cli not available"));
  }

  const envs: Array<"production" | "preview" | "development"> = [
    "production",
    "preview",
    "development",
  ];
  for (const env of envs) {
    let list: Map<string, string>;
    try {
      list = await easEnvList(env);
    } catch {
      checks.push(skip("eas", `env-${env}`, "eas env:list unavailable"));
      continue;
    }
    const required = ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_APP_BUNDLE_ID"];
    const missing = required.filter((k) => !list.has(k));
    if (missing.length === 0) checks.push(ok("eas", `env-${env}`, "required vars present"));
    else
      checks.push(
        warn(
          "eas",
          `env-${env}`,
          `missing ${missing.join(", ")}`,
          "run `bunx vexpo full` to init EAS + mirror env",
        ),
      );

    // The JWT rotation cron + the deploy_convex step in deploy-production.yml
    // both read these from EAS env (production, secret visibility). Names
    // appear in `eas env:list` even when value is masked, so we can verify
    // presence without ever seeing the secret values.
    if (env === "production") {
      const rotationSecrets = [
        "CONVEX_DEPLOY_KEY",
        "APPLE_P8_PRIVATE_KEY",
        "APPLE_TEAM_ID",
        "APPLE_KEY_ID",
        "APPLE_SERVICES_ID",
      ];
      const missingRotation = rotationSecrets.filter((k) => !list.has(k));
      if (missingRotation.length === 0)
        checks.push(ok("eas", "rotation-secrets", "all 5 present (production)"));
      else
        checks.push(
          warn(
            "eas",
            "rotation-secrets",
            `missing ${missingRotation.join(", ")}`,
            "set with `eas env:create --visibility secret --environment production`",
          ),
        );
    }
  }

  return checks;
}

// ---------- Coherence (cross-references) ----------

function verifyCoherence(ctx: VerifyContext): Check[] {
  const checks: Check[] = [];
  const env = ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;

  const expoBundle = local.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  const convexBundle = env.get("APP_BUNDLE_ID");
  if (expoBundle && convexBundle && expoBundle !== convexBundle) {
    checks.push(
      fail(
        "coherence",
        "bundle-id-match",
        `EXPO_PUBLIC_APP_BUNDLE_ID='${expoBundle}' ≠ Convex APP_BUNDLE_ID='${convexBundle}'`,
      ),
    );
  } else if (expoBundle && convexBundle) {
    checks.push(ok("coherence", "bundle-id-match", expoBundle));
  } else if (expoBundle && ctx.appConfig.bundleIdFallback) {
    if (expoBundle === ctx.appConfig.bundleIdFallback)
      checks.push(ok("coherence", "bundle-id-config", expoBundle));
    else
      checks.push(
        warn(
          "coherence",
          "bundle-id-config",
          `EXPO_PUBLIC_APP_BUNDLE_ID='${expoBundle}' ≠ app.config.ts fallback '${ctx.appConfig.bundleIdFallback}'`,
        ),
      );
  }

  const expoTeam = local.get("EXPO_PUBLIC_APPLE_TEAM_ID");
  const convexTeam = env.get("APPLE_TEAM_ID");
  if (expoTeam && convexTeam && expoTeam !== convexTeam)
    checks.push(
      fail(
        "coherence",
        "team-id-match",
        `EXPO_PUBLIC_APPLE_TEAM_ID='${expoTeam}' ≠ Convex APPLE_TEAM_ID='${convexTeam}'`,
      ),
    );
  else if (expoTeam && convexTeam) checks.push(ok("coherence", "team-id-match", expoTeam));

  const localServices = local.get("APPLE_SERVICES_ID");
  const convexServices = env.get("APPLE_CLIENT_ID");
  if (localServices && convexServices && localServices !== convexServices)
    checks.push(
      fail(
        "coherence",
        "services-id-match",
        `APPLE_SERVICES_ID='${localServices}' ≠ Convex APPLE_CLIENT_ID='${convexServices}'`,
      ),
    );
  else if (localServices && convexServices)
    checks.push(ok("coherence", "services-id-match", localServices));

  const expoSite = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");
  const convexSite = env.get("SITE_URL");
  if (
    expoSite &&
    convexSite &&
    convexSite !== expoSite &&
    !convexSite.startsWith(local.get("EXPO_PUBLIC_SITE_URL") ?? "")
  ) {
    // SITE_URL on Convex is the *app* URL (e.g. vexpo://) and EXPO_PUBLIC_CONVEX_SITE_URL is the *deployment* site URL. they're different things, but worth a sanity note if SITE_URL doesn't match the local app scheme either.
    const localSite = local.get("EXPO_PUBLIC_SITE_URL");
    if (localSite && convexSite !== localSite) {
      checks.push(
        warn(
          "coherence",
          "site-url-match",
          `Convex SITE_URL='${convexSite}' ≠ EXPO_PUBLIC_SITE_URL='${localSite}'`,
        ),
      );
    }
  }

  if (ctx.appConfig.name) {
    const convexName = env.get("APP_NAME");
    // app.config.ts is evaluated without APP_VARIANT set, so the name reflects
    // the prod variant. On dev, accept the prod name OR the prod name with a
    // " (Dev)" / " Dev" suffix, since templates branch with `IS_DEV ? "X (Dev)" : "X"`.
    const expected = ctx.appConfig.name;
    const matches =
      convexName === expected ||
      (ctx.channel === "dev" &&
        (convexName === `${expected} (Dev)` || convexName === `${expected} Dev`));
    if (convexName && !matches) {
      checks.push(
        warn(
          "coherence",
          "app-name-match",
          `APP_NAME='${convexName}' ≠ app.config.ts name='${expected}'`,
        ),
      );
    } else if (convexName) {
      checks.push(ok("coherence", "app-name-match", convexName));
    }
  }

  return checks;
}

// ---------- Files ----------

function verifyFiles(ctx: VerifyContext): Check[] {
  const checks: Check[] = [];
  const expectedKeys = [
    "CONVEX_DEPLOYMENT",
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_CONVEX_SITE_URL",
    "EXPO_PUBLIC_SITE_URL",
    "EXPO_PUBLIC_APP_BUNDLE_ID",
    "EXPO_PUBLIC_APPLE_TEAM_ID",
  ];
  const source = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const sourceName = ctx.channel === "prod" ? ".env.prod" : ".env.local";
  if (source.size === 0) {
    checks.push(skip("files", `${sourceName}-present`, `no ${sourceName} file`));
    return checks;
  }
  const missing = expectedKeys.filter((k) => !source.has(k));
  if (missing.length === 0) checks.push(ok("files", `${sourceName}-keys`, "all expected keys"));
  else
    checks.push(
      warn(
        "files",
        `${sourceName}-keys`,
        `missing ${missing.length} key${missing.length === 1 ? "" : "s"}`,
        missing.join(", "),
      ),
    );
  return checks;
}

// ---------- Top-level ----------

export async function readContext(channel: Channel): Promise<VerifyContext> {
  const [envLocal, envProd, convexEnv, convexProdEnv, appConfigFacts, ascCreds] = await Promise.all(
    [
      readEnvFile(".env.local"),
      readEnvFile(".env.prod").then(async (m) => (m.size > 0 ? m : readEnvFile(".env.production"))),
      convexEnvMap().catch(() => new Map<string, string>()),
      convexEnvMap({ prod: true } satisfies ConvexTarget).catch(() => new Map<string, string>()),
      readAppConfigFacts(),
      loadAscCreds(),
    ],
  );

  return {
    channel,
    envLocal,
    envProd,
    convexEnv,
    convexProdEnv,
    appConfig: appConfigFacts,
    ascCreds,
  };
}

async function readAppConfigFacts(): Promise<AppConfigFacts> {
  try {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile("app.config.ts", "utf8");
    const name = /name:\s*IS_DEV\s*\?\s*"[^"]+"\s*:\s*"([^"]+)",/.exec(text)?.[1];
    const bundleIdFallback = /EXPO_PUBLIC_APP_BUNDLE_ID\s*\?\?\s*(?:`([^`]+)`|"([^"]+)")/.exec(
      text,
    );
    const teamIdFallback = /EXPO_PUBLIC_APPLE_TEAM_ID\s*\?\?\s*"([^"]+)"/.exec(text)?.[1];
    const scheme = /scheme:\s*"([^"]+)"/.exec(text)?.[1];
    return {
      name,
      bundleIdFallback: bundleIdFallback?.[1] ?? bundleIdFallback?.[2],
      teamIdFallback,
      scheme,
    };
  } catch {
    return {};
  }
}

async function loadAscCreds(): Promise<AscCredentials | null> {
  try {
    const state = await loadState();
    const rec = state.steps["asc-key"];
    if (!rec?.outputs) return null;
    const out = rec.outputs as Record<string, unknown>;
    const issuerId = out.issuerId as string | undefined;
    const keyId = out.keyId as string | undefined;
    const p8Path = out.p8Path as string | undefined;
    if (!issuerId || !keyId || !p8Path) return null;
    return { issuerId, keyId, privateKey: { path: p8Path } };
  } catch {
    return null;
  }
}

export async function verifyAll(ctx: VerifyContext): Promise<Check[]> {
  const [files, convex, resend, apple, eas] = await Promise.all([
    Promise.resolve(verifyFiles(ctx)),
    verifyConvex(ctx),
    verifyResend(ctx),
    verifyApple(ctx),
    verifyEas(ctx),
  ]);
  const coherence = verifyCoherence(ctx);
  return [...files, ...convex, ...resend, ...apple, ...eas, ...coherence];
}

export function summarize(checks: Check[]): {
  ok: number;
  warn: number;
  fail: number;
  skip: number;
} {
  return {
    ok: checks.filter((c) => c.severity === "ok").length,
    warn: checks.filter((c) => c.severity === "warn").length,
    fail: checks.filter((c) => c.severity === "fail").length,
    skip: checks.filter((c) => c.severity === "skip").length,
  };
}
