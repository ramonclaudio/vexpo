import { existsSync, readFileSync } from "node:fs";

import {
  appleTeamIdFallback,
  bundleIdFallback,
  declaredAppName,
  scheme as appScheme,
} from "./app.ts";
import { validate as ascValidate, makeAscClient, type AscCredentials } from "./asc-api.ts";
import { loadAscCreds } from "./asc-state.ts";
import { deploymentSlug, envMap as convexEnvMap, type ConvexTarget } from "./convex-env.ts";
import {
  checkToken,
  deploymentsOfType,
  describeDeployment,
  listProjectDeployments,
} from "./convex-management.ts";
import { ascStatus } from "./eas-integrations.ts";
import { fetchWithTimeout } from "./http-retry.ts";
import { submitProfilesMissingAscAppId } from "./eas-submit.ts";
import {
  envList as easEnvList,
  resolveProjectId,
  projectInfo as easProjectInfo,
  whoami as easWhoami,
} from "./eas-project.ts";
import { readEnvFile, type Channel } from "./env-files.ts";
import { listDomains, listWebhooks, probeAccess } from "./resend-api.ts";

export type { Channel };

export type Severity = "ok" | "warn" | "fail" | "skip";

export type Category = "convex" | "resend" | "apple" | "eas" | "coherence" | "files";

export type Check = {
  category: Category;
  name: string;
  severity: Severity;
  message: string;
  details?: string;
};

export type VerifyContext = {
  channel: Channel;
  envLocal: Map<string, string>;
  envProd: Map<string, string>;
  // null means the read itself failed (auth/CLI), which is not "every var
  // unset": doctor must warn "unreadable" instead of failing checks that are
  // merely unverifiable (the prod deploy-key path hit exactly this).
  convexEnv: Map<string, string> | null;
  convexProdEnv: Map<string, string> | null;
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

type StoreConfigFacts = {
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
  const m = /^([a-z0-9-]+)\.convex\.(cloud|site)$/i.exec(host);
  return m ? m[1] : null;
}

async function fetchOk(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD" }, timeoutMs);
    return { ok: res.ok || res.status === 405, status: res.status }; // 405 = HEAD not allowed but server is up
  } catch {
    // TimeoutError or a network failure both mean "not reachable".
    return { ok: false, status: 0 };
  }
}

function convexEnvFor(ctx: VerifyContext): Map<string, string> | null {
  return ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
}

async function verifyConvex(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  const env = convexEnvFor(ctx);
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;

  // Login freshness, gated on a configured deployment so lite/offline stays fast.
  // A present-but-expired token is the confusing case the file-stat can't catch.
  if (local.get("CONVEX_DEPLOYMENT")) {
    const status = await checkToken();
    if (status === "unauthorized") {
      checks.push(
        fail("convex", "login", "Convex token expired or revoked", "run `npx convex login`"),
      );
    } else if (status === "valid") {
      checks.push(ok("convex", "login", "token valid"));
    }
  }

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

  if (env === null) {
    checks.push(
      warn(
        "convex",
        "env-read",
        `Convex env unreadable on ${ctx.channel}; per-var checks skipped`,
        ctx.channel === "prod"
          ? "check CONVEX_DEPLOY_KEY in .env.prod, or run `npx convex login`"
          : "run `npx convex login`",
      ),
    );
  } else {
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
  }

  // Enumerate the project's deployments via the Platform API to catch a
  // duplicate dev deployment (the EAS Convex integration spins up a second one
  // alongside a personal `convex dev` deployment). Skips silently when the
  // management token isn't available (offline / not logged in).
  const deploymentName = deploymentSlug(local.get("CONVEX_DEPLOYMENT"));
  if (deploymentName) {
    const deployments = await listProjectDeployments(deploymentName);
    if (deployments) {
      const devs = deploymentsOfType(deployments, "dev");
      if (devs.length > 1) {
        checks.push(
          warn(
            "convex",
            "deployments",
            `${devs.length} dev deployments in this project`,
            `${devs.map(describeDeployment).join(", ")} — pick one canonical, delete the others`,
          ),
        );
      } else {
        checks.push(ok("convex", "deployments", `${deployments.length} total, ${devs.length} dev`));
      }
    }
  }

  return checks;
}

async function verifyResend(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  const env = convexEnvFor(ctx);
  if (env === null) {
    checks.push(
      skip("resend", "api-key-set", `Convex env unreadable on ${ctx.channel}; checks skipped`),
    );
    return checks;
  }
  const apiKey = env.get("RESEND_API_KEY");
  const emailFrom = env.get("EMAIL_FROM");
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const expectedSiteUrl = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");

  if (!apiKey) {
    // Lite mode marker: `REQUIRE_EMAIL_VERIFICATION` is unset, sign-up
    // auto-verifies, no Resend needed. Skip rather than fail.
    const requireEmailVerification = env.get("REQUIRE_EMAIL_VERIFICATION");
    if (!requireEmailVerification || requireEmailVerification === "false") {
      checks.push(skip("resend", "api-key-set", "lite mode (run `npx vexpo full` to provision)"));
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
      const others = webhooks.map((w) => w.endpoint);
      // The key's account has resend-webhooks for OTHER convex.site deployments but
      // none for this one. That's the classic post-migration drift: the deployment
      // slug changed and the webhook didn't follow. The fix is to repoint, not to
      // swap keys. (Only suspect the wrong account if the domain check also fails.)
      const staleConvex = others.filter(
        (e) => e.includes(".convex.site") && e.endsWith("/resend-webhook"),
      );
      if (staleConvex.length > 0) {
        checks.push(
          warn(
            "resend",
            "webhook-endpoint",
            `no webhook for this deployment; ${staleConvex.length} point at other convex.site deployments (stale after a deployment migration)`,
            `run \`vexpo resend --repoint${ctx.channel === "prod" ? " --prod" : ""}\` to move it to ${expectedEndpoint} and realign RESEND_WEBHOOK_SECRET. stale: ${staleConvex.join(", ")}`,
          ),
        );
      } else {
        checks.push(
          warn(
            "resend",
            "webhook-endpoint",
            `no webhook pointing at ${expectedEndpoint}`,
            others.length ? `existing: ${others.join(", ")}` : undefined,
          ),
        );
      }
    } else if (match.status !== "enabled" && match.status !== "active") {
      checks.push(warn("resend", "webhook-endpoint", `webhook ${match.id} status=${match.status}`));
    } else {
      checks.push(ok("resend", "webhook-endpoint", `→ ${expectedEndpoint}`));
    }
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
            "re-run `npx vexpo resend` to refresh subscription",
          ),
        );
    }
  }

  return checks;
}

async function verifyApple(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];
  const env = convexEnvFor(ctx);
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;

  const servicesId = env?.get("APPLE_CLIENT_ID") ?? local.get("APPLE_SERVICES_ID");
  const teamId = env?.get("APPLE_TEAM_ID") ?? local.get("EXPO_PUBLIC_APPLE_TEAM_ID");
  const keyId = env?.get("APPLE_KEY_ID");
  const jwt = env?.get("APPLE_CLIENT_SECRET");

  if (env === null) {
    // The ASC-key checks below run on local creds, so only the env-derived
    // checks go quiet.
    checks.push(
      skip("apple", "convex-env", `Convex env unreadable on ${ctx.channel}; env checks skipped`),
    );
  } else if (!teamId) checks.push(warn("apple", "team-id-set", "APPLE_TEAM_ID not set"));
  else if (!/^[A-Z0-9]{10}$/.test(teamId))
    checks.push(warn("apple", "team-id-format", `APPLE_TEAM_ID='${teamId}' not 10 alphanumeric`));

  if (keyId && !/^[A-Z0-9]{10}$/.test(keyId))
    checks.push(warn("apple", "key-id-format", `APPLE_KEY_ID='${keyId}' not 10 alphanumeric`));

  if (servicesId && !/^[a-z0-9.-]+$/i.test(servicesId))
    checks.push(warn("apple", "services-id-format", `APPLE_SERVICES_ID looks malformed`));

  if (env === null) {
    // jwt is unknowable with the env unreadable; the convex-env skip above
    // already says why, so don't mislabel it "Apple Sign In disabled".
  } else if (jwt) {
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
                "run `npx vexpo apple services-id` to provision it",
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
    } else {
      checks.push(fail("apple", "asc-key-valid", v.reason));
    }
  } else {
    checks.push(
      skip("apple", "asc-key-valid", "no cached ASC creds (run `npx vexpo apple asc-key`)"),
    );
  }

  return checks;
}

async function verifyEas(ctx: VerifyContext): Promise<Check[]> {
  const checks: Check[] = [];

  let projectId: string | null = null;
  try {
    projectId = await resolveProjectId();
  } catch {
    // leave null; we still probe EAS env below before deciding lite vs fail
  }

  // Lite mode (no projectId AND no sign of provisioning) skips before any EAS
  // shell-out, so the read path stays fast and offline-safe. REQUIRE_EMAIL_VERIFICATION
  // unset on Convex is the lite-setup marker.
  if (!projectId) {
    const rev = convexEnvFor(ctx)?.get("REQUIRE_EMAIL_VERIFICATION");
    if (!rev || rev === "false") {
      checks.push(skip("eas", "project-id", "lite mode (run `npx vexpo full` to init EAS)"));
      return checks;
    }
  }

  // Account-level, needs no projectId: a logged-out eas-cli fails every later
  // EAS phase non-interactively, so say it first. Runs after the lite-mode
  // return so lite doctor stays free of EAS shell-outs.
  try {
    const who = await easWhoami();
    checks.push(
      who
        ? ok("eas", "signed-in", who)
        : warn("eas", "signed-in", "not signed in (run `npx eas-cli login`)"),
    );
  } catch {
    checks.push(skip("eas", "signed-in", "eas CLI not available"));
  }

  // Fetch all three EAS env maps once. eas-cli resolves the project itself, so
  // this can succeed even when vexpo's projectId resolution returns null (a
  // stubbed app.json with EAS_PROJECT_ID only in the shell).
  const envNames = ["production", "preview", "development"] as const;
  const envMaps = new Map<(typeof envNames)[number], Map<string, string> | null>();
  for (const e of envNames) envMaps.set(e, await easEnvList(e));
  const provisioned = [...envMaps.values()].some((m) => m !== null && m.size > 0);

  if (projectId) {
    checks.push(ok("eas", "project-id", projectId));
  } else if (provisioned) {
    // Provisioned but unresolved: don't skip the whole group. A stubbed app.json
    // with no EAS_PROJECT_ID is how stale EAS env + a missing ASC link stayed
    // hidden, so run the env + integration checks anyway.
    checks.push(
      warn(
        "eas",
        "project-id",
        "EAS env is provisioned but projectId is unresolved",
        "set EAS_PROJECT_ID in .env.local (app.json is intentionally stubbed)",
      ),
    );
  } else {
    checks.push(
      fail("eas", "project-id", "no projectId in app.json, EAS_PROJECT_ID env, or .env.local"),
    );
    return checks;
  }

  // project-info needs a resolved projectId; best-effort,
  // never short-circuit the env + integration checks below.
  if (projectId) {
    try {
      const info = await easProjectInfo();
      if (info && info.id === projectId) checks.push(ok("eas", "project-info", info.fullName));
      else if (info)
        checks.push(
          fail(
            "eas",
            "project-info",
            `local projectId (${projectId}) doesn't match resolved project (${info.id})`,
            "run `vexpo eas` to re-link",
          ),
        );
      else
        checks.push(
          warn("eas", "project-info", "eas project:info failed (project deleted or transferred?)"),
        );
    } catch {
      checks.push(skip("eas", "project-info", "eas-cli not available"));
    }
  }

  for (const env of envNames) {
    const list = envMaps.get(env) ?? null;
    if (!list) {
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
          "run `npx vexpo full` to init EAS + mirror env",
        ),
      );

    // Value drift, not just presence: does the EAS-stored Convex URL point at the
    // same deployment the local env file does? Presence alone passed green while
    // EAS still pointed at the OLD project after a migration.
    const expected = (env === "development" ? ctx.envLocal : ctx.envProd).get(
      "EXPO_PUBLIC_CONVEX_URL",
    );
    const actual = list.get("EXPO_PUBLIC_CONVEX_URL");
    if (expected && actual) {
      const expSlug = deploymentSlugFromHost(hostnameOf(expected) ?? "");
      const actSlug = deploymentSlugFromHost(hostnameOf(actual) ?? "");
      if (expSlug && actSlug && expSlug !== actSlug) {
        checks.push(
          fail(
            "eas",
            `convex-url-${env}`,
            `EAS points at ${actSlug}, local at ${expSlug}`,
            "run `vexpo env push` + `vexpo env convex-key` to repoint EAS at the active deployment",
          ),
        );
      } else if (expSlug && actSlug) {
        checks.push(ok("eas", `convex-url-${env}`, `points at ${actSlug}`));
      }
    }

    // The JWT rotation cron + the deploy_convex step in deploy-production.yml
    // both read these from EAS env (production, secret visibility). Names appear
    // in `eas env:list` even when the value is masked, so presence is checkable.
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

  // ASC integration: lets `eas submit` resolve the app interactively. warn (not
  // fail) since not every project ships.
  try {
    const status = await ascStatus();
    if (status.status === "connected") {
      checks.push(
        ok("eas", "asc-integration", status.appStoreConnectApp?.bundleIdentifier ?? "connected"),
      );
      // Non-interactive submit (CI) reads the app id only from eas.json's submit
      // profile, the integration doesn't satisfy it. Nudge if a profile lacks it.
      const missing = existsSync("eas.json")
        ? submitProfilesMissingAscAppId(readFileSync("eas.json", "utf8"))
        : [];
      if (missing.length > 0) {
        checks.push(
          warn(
            "eas",
            "asc-submit-id",
            `submit profile${missing.length === 1 ? "" : "s"} ${missing.join(", ")} missing ascAppId`,
            "run `vexpo asc connect` to write it; non-interactive `eas submit` (CI) fails without it",
          ),
        );
      } else if (existsSync("eas.json")) {
        checks.push(ok("eas", "asc-submit-id", "submit profiles carry ascAppId"));
      }
    } else {
      checks.push(
        warn(
          "eas",
          "asc-integration",
          `not connected (${status.status})`,
          "run `vexpo asc connect` in a terminal; if the key picker shows only stale keys, its create-or-upload entry mints the EAS-managed key (a second key alongside eas.json's is by design)",
        ),
      );
    }
  } catch {
    checks.push(skip("eas", "asc-integration", "eas integrations:asc:status unavailable"));
  }

  return checks;
}

function verifyCoherence(ctx: VerifyContext): Check[] {
  const checks: Check[] = [];
  // Every coherence check needs both sides present before it emits anything,
  // so an unreadable env (null) degrades to "no cross-checks", never a fail.
  const env = convexEnvFor(ctx) ?? new Map<string, string>();
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

  // SITE_URL on Convex is the *app* URL (e.g. vexpo://), a different thing from
  // the deployment site URL. Worth a note only when it also doesn't match the
  // local app scheme (EXPO_PUBLIC_SITE_URL).
  const expoSite = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");
  const convexSite = env.get("SITE_URL");
  const localSite = local.get("EXPO_PUBLIC_SITE_URL");
  if (
    expoSite &&
    convexSite &&
    localSite &&
    convexSite !== localSite &&
    !convexSite.startsWith(localSite)
  ) {
    checks.push(
      warn(
        "coherence",
        "site-url-match",
        `Convex SITE_URL='${convexSite}' ≠ EXPO_PUBLIC_SITE_URL='${localSite}'`,
      ),
    );
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

export async function readContext(channel: Channel): Promise<VerifyContext> {
  // A dev CONVEX_DEPLOY_KEY in .env.local shadows `--prod`, so reading prod env
  // via bare `--prod` silently returns the DEV deployment. Point the Convex CLI
  // at the prod env file (it carries the prod deploy key) so prod checks hit the
  // real prod deployment. With no prod file we can't reach prod, so the map stays
  // empty rather than masquerading dev env as prod (mirrors env push readRemoteState).
  const prodEnvFile = existsSync(".env.prod")
    ? ".env.prod"
    : existsSync(".env.production")
      ? ".env.production"
      : undefined;
  const [envLocal, envProd, convexEnv, convexProdEnv, appConfigFacts, ascCreds] = await Promise.all(
    [
      readEnvFile(".env.local"),
      readEnvFile(".env.prod").then(async (m) => (m.size > 0 ? m : readEnvFile(".env.production"))),
      // A null from envMap means the read failed; keep it null so checks
      // report "unreadable" instead of failing every var as unset.
      convexEnvMap().catch(() => null),
      prodEnvFile
        ? convexEnvMap({ prod: true, envFile: prodEnvFile } satisfies ConvexTarget).catch(
            () => null,
          )
        : Promise.resolve(null),
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

export async function readAppConfigFacts(): Promise<AppConfigFacts> {
  const [name, scheme, bundleId, teamId] = await Promise.all([
    declaredAppName(),
    appScheme(),
    bundleIdFallback(),
    appleTeamIdFallback(),
  ]);
  return {
    name,
    bundleIdFallback: bundleId ?? undefined,
    teamIdFallback: teamId ?? undefined,
    scheme,
  };
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
