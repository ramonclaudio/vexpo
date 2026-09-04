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
import { findProdEnvFile, readEnvFile, type Channel } from "./env-files.ts";
import { listDomains, listWebhooks, probeAccess } from "./resend-api.ts";
import { errText, plural } from "./output.ts";

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
    return { ok: res.ok || res.status === 405, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function convexEnvFor(ctx: VerifyContext): Map<string, string> | null {
  return ctx.channel === "prod" ? ctx.convexProdEnv : ctx.convexEnv;
}

async function convexLoginChecks(local: Map<string, string>): Promise<Check[]> {
  if (!local.get("CONVEX_DEPLOYMENT")) return [];
  const status = await checkToken();
  if (status === "unauthorized") {
    return [fail("convex", "login", "Convex token expired or revoked", "run `npx convex login`")];
  }
  return status === "valid" ? [ok("convex", "login", "token valid")] : [];
}

async function convexReachChecks(cloudUrl: string | undefined): Promise<Check[]> {
  if (!cloudUrl) return [skip("convex", "deployment-reachable", "no EXPO_PUBLIC_CONVEX_URL")];
  const reach = await fetchOk(cloudUrl);
  return [
    reach.ok
      ? ok("convex", "deployment-reachable", `${cloudUrl} → ${reach.status}`)
      : fail("convex", "deployment-reachable", `${cloudUrl} unreachable (status ${reach.status})`),
  ];
}

function convexSlugMatchChecks(cloudUrl?: string, siteUrl?: string): Check[] {
  if (!cloudUrl || !siteUrl) return [];
  const cloudSlug = deploymentSlugFromHost(hostnameOf(cloudUrl) ?? "");
  const siteSlug = deploymentSlugFromHost(hostnameOf(siteUrl) ?? "");
  if (!cloudSlug || !siteSlug) return [];
  if (cloudSlug === siteSlug) return [ok("convex", "site-cloud-match", `slug=${cloudSlug}`)];
  return [
    warn(
      "convex",
      "site-cloud-match",
      `cloud=${cloudSlug} ≠ site=${siteSlug} (different deployments?)`,
    ),
  ];
}

function betterAuthSecretChecks(env: Map<string, string> | null, channel: Channel): Check[] {
  if (env === null) {
    return [
      warn(
        "convex",
        "env-read",
        `Convex env unreadable on ${channel}; per-var checks skipped`,
        channel === "prod"
          ? "check CONVEX_DEPLOY_KEY in .env.prod, or run `npx convex login`"
          : "run `npx convex login`",
      ),
    ];
  }
  const secret = env.get("BETTER_AUTH_SECRET");
  if (!secret) {
    return [fail("convex", "better-auth-secret", `not set on Convex (${channel})`)];
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(secret, "base64");
  } catch {
    return [fail("convex", "better-auth-secret", "BETTER_AUTH_SECRET not valid base64")];
  }
  if (bytes.length >= 32) return [ok("convex", "better-auth-secret", `${bytes.length}b`)];
  return [
    warn(
      "convex",
      "better-auth-secret",
      `BETTER_AUTH_SECRET is only ${bytes.length}b (32+ recommended)`,
    ),
  ];
}

async function convexDeploymentChecks(local: Map<string, string>): Promise<Check[]> {
  const deploymentName = deploymentSlug(local.get("CONVEX_DEPLOYMENT"));
  if (!deploymentName) return [];
  const deployments = await listProjectDeployments(deploymentName);
  if (!deployments) return [];
  const devs = deploymentsOfType(deployments, "dev");
  if (devs.length <= 1) {
    return [ok("convex", "deployments", `${deployments.length} total, ${devs.length} dev`)];
  }
  return [
    warn(
      "convex",
      "deployments",
      `${devs.length} dev deployments in this project`,
      `${devs.map(describeDeployment).join(", ")} — pick one canonical, delete the others`,
    ),
  ];
}

async function verifyConvex(ctx: VerifyContext): Promise<Check[]> {
  const env = convexEnvFor(ctx);
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const cloudUrl = local.get("EXPO_PUBLIC_CONVEX_URL");
  const siteUrl = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");

  return [
    ...(await convexLoginChecks(local)),
    ...(await convexReachChecks(cloudUrl)),
    ...convexSlugMatchChecks(cloudUrl, siteUrl),
    ...betterAuthSecretChecks(env, ctx.channel),
    ...(await convexDeploymentChecks(local)),
  ];
}

type ResendDomain = { id: string; name: string; status: string };
type ResendWebhook = { id: string; endpoint: string; status: string };

function resendUnconfiguredChecks(env: Map<string, string>, channel: Channel): Check[] {
  const required = env.get("REQUIRE_EMAIL_VERIFICATION");
  if (!required || required === "false") {
    return [skip("resend", "api-key-set", "lite mode (run `npx vexpo full` to provision)")];
  }
  return [fail("resend", "api-key-set", `RESEND_API_KEY not set on Convex (${channel})`)];
}

async function listResendResources(
  apiKey: string,
  access: string,
): Promise<{ domains: ResendDomain[]; webhooks: ResendWebhook[]; checks: Check[] }> {
  if (access !== "full") {
    return {
      domains: [],
      webhooks: [],
      checks: [
        skip(
          "resend",
          "domain-coverage",
          `key is sending-restricted; can't enumerate domains/webhooks`,
        ),
      ],
    };
  }
  const checks: Check[] = [];
  let domains: ResendDomain[] = [];
  let webhooks: ResendWebhook[] = [];
  try {
    domains = await listDomains(apiKey);
  } catch (e) {
    checks.push(warn("resend", "domains-readable", `couldn't list domains: ${errText(e)}`));
  }
  try {
    webhooks = await listWebhooks(apiKey);
  } catch (e) {
    checks.push(warn("resend", "webhooks-readable", `couldn't list webhooks: ${errText(e)}`));
  }
  return { domains, webhooks, checks };
}

function emailFromChecks(
  emailFrom: string | undefined,
  domains: ResendDomain[],
  channel: Channel,
): Check[] {
  if (!emailFrom) {
    return [warn("resend", "email-from-set", `EMAIL_FROM not set on Convex (${channel})`)];
  }
  const at = emailFrom.indexOf("@");
  if (at < 0) return [fail("resend", "email-from-valid", `EMAIL_FROM=${emailFrom} (no @)`)];
  if (domains.length === 0) return [];

  const domain = emailFrom.slice(at + 1);
  const match = domains.find((d) => d.name === domain);
  if (!match) {
    return [
      warn(
        "resend",
        "email-from-domain",
        `EMAIL_FROM=${emailFrom} but '${domain}' not in Resend domains: ${domains
          .map((d) => d.name)
          .join(", ")}`,
      ),
    ];
  }
  if (match.status !== "verified") {
    return [
      warn(
        "resend",
        "email-from-domain",
        `EMAIL_FROM domain '${domain}' status=${match.status} (not verified)`,
      ),
    ];
  }
  return [ok("resend", "email-from-domain", `${domain} verified`)];
}

function missingWebhookCheck(
  webhooks: ResendWebhook[],
  expectedEndpoint: string,
  channel: Channel,
): Check {
  const others = webhooks.map((w) => w.endpoint);
  const stale = others.filter((e) => e.includes(".convex.site") && e.endsWith("/resend-webhook"));
  if (stale.length === 0) {
    return warn(
      "resend",
      "webhook-endpoint",
      `no webhook pointing at ${expectedEndpoint}`,
      others.length ? `existing: ${others.join(", ")}` : undefined,
    );
  }
  return warn(
    "resend",
    "webhook-endpoint",
    `no webhook for this deployment; ${stale.length} point at other convex.site deployments (stale after a deployment migration)`,
    `run \`vexpo resend --repoint${channel === "prod" ? " --prod" : ""}\` to move it to ${expectedEndpoint} and realign RESEND_WEBHOOK_SECRET. stale: ${stale.join(", ")}`,
  );
}

function webhookEventChecks(webhook: ResendWebhook): Check[] {
  const required = ["email.bounced", "email.complained", "email.suppressed", "email.failed"];
  const events = (webhook as { events?: string[] }).events ?? [];
  const missing = required.filter((e) => !events.includes(e));
  if (missing.length === 0) {
    return [ok("resend", "webhook-events", `${required.length} actionable events covered`)];
  }
  return [
    warn(
      "resend",
      "webhook-events",
      `webhook missing ${missing.join(", ")}`,
      "re-run `npx vexpo resend` to refresh subscription",
    ),
  ];
}

function webhookChecks(
  expectedSiteUrl: string | undefined,
  webhooks: ResendWebhook[],
  channel: Channel,
): Check[] {
  if (!expectedSiteUrl || webhooks.length === 0) return [];
  const expectedEndpoint = `${expectedSiteUrl.replace(/\/$/, "")}/resend-webhook`;
  const match = webhooks.find((w) => w.endpoint === expectedEndpoint);
  if (!match) return [missingWebhookCheck(webhooks, expectedEndpoint, channel)];

  const live = match.status === "enabled" || match.status === "active";
  return [
    live
      ? ok("resend", "webhook-endpoint", `→ ${expectedEndpoint}`)
      : warn("resend", "webhook-endpoint", `webhook ${match.id} status=${match.status}`),
    ...webhookEventChecks(match),
  ];
}

async function verifyResend(ctx: VerifyContext): Promise<Check[]> {
  const env = convexEnvFor(ctx);
  if (env === null) {
    return [
      skip("resend", "api-key-set", `Convex env unreadable on ${ctx.channel}; checks skipped`),
    ];
  }
  const apiKey = env.get("RESEND_API_KEY");
  if (!apiKey) return resendUnconfiguredChecks(env, ctx.channel);

  const access = await probeAccess(apiKey);
  if (access === "invalid") {
    return [fail("resend", "api-key-valid", "RESEND_API_KEY rejected by Resend")];
  }

  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const { domains, webhooks, checks } = await listResendResources(apiKey, access);
  return [
    ok("resend", "api-key-valid", `key authenticated (access=${access})`),
    ...checks,
    ...emailFromChecks(env.get("EMAIL_FROM"), domains, ctx.channel),
    ...webhookChecks(local.get("EXPO_PUBLIC_CONVEX_SITE_URL"), webhooks, ctx.channel),
  ];
}

type AppleIds = { servicesId?: string; teamId?: string; keyId?: string };

const TEN_ALNUM = /^[A-Z0-9]{10}$/;

function appleIdFormatChecks(
  env: Map<string, string> | null,
  ids: AppleIds,
  channel: Channel,
): Check[] {
  const checks: Check[] = [];
  if (env === null) {
    checks.push(
      skip("apple", "convex-env", `Convex env unreadable on ${channel}; env checks skipped`),
    );
  } else if (!ids.teamId) {
    checks.push(warn("apple", "team-id-set", "APPLE_TEAM_ID not set"));
  } else if (!TEN_ALNUM.test(ids.teamId)) {
    checks.push(
      warn("apple", "team-id-format", `APPLE_TEAM_ID='${ids.teamId}' not 10 alphanumeric`),
    );
  }

  if (ids.keyId && !TEN_ALNUM.test(ids.keyId)) {
    checks.push(warn("apple", "key-id-format", `APPLE_KEY_ID='${ids.keyId}' not 10 alphanumeric`));
  }
  if (ids.servicesId && !/^[a-z0-9.-]+$/i.test(ids.servicesId)) {
    checks.push(warn("apple", "services-id-format", `APPLE_SERVICES_ID looks malformed`));
  }
  return checks;
}

function jwtExpiryCheck(payload: Record<string, unknown>): Check {
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = Math.floor((exp - now) / 86_400);
  if (exp <= now) return fail("apple", "jwt-expiry", `JWT expired ${-daysLeft}d ago`);
  if (daysLeft < 30)
    return warn("apple", "jwt-expiry", `JWT expires in ${daysLeft}d (rotate soon)`);
  return ok("apple", "jwt-expiry", `${daysLeft}d remaining`);
}

function claimCheck(
  name: string,
  claim: unknown,
  expected: string | undefined,
  claimLabel: string,
  expectedLabel: string,
): Check[] {
  if (!claim || !expected) return [];
  if (claim === expected) return [ok("apple", name, claim as string)];
  return [
    fail("apple", name, `${claimLabel}='${claim as string}' ≠ ${expectedLabel}='${expected}'`),
  ];
}

function appleJwtChecks(jwt: string, ids: AppleIds): Check[] {
  const decoded = decodeJwt(jwt);
  if (!decoded) return [fail("apple", "jwt-decode", "APPLE_CLIENT_SECRET is not a valid JWT")];

  const { header, payload } = decoded;
  const checks: Check[] = [];
  if (header.alg !== "ES256") {
    checks.push(warn("apple", "jwt-alg", `JWT alg=${header.alg} (expected ES256)`));
  }
  if (payload.aud !== "https://appleid.apple.com") {
    checks.push(
      warn("apple", "jwt-aud", `JWT aud=${payload.aud} (expected https://appleid.apple.com)`),
    );
  }
  checks.push(
    jwtExpiryCheck(payload),
    ...claimCheck("jwt-kid-matches", header.kid, ids.keyId, "JWT.header.kid", "APPLE_KEY_ID"),
    ...claimCheck("jwt-iss-matches", payload.iss, ids.teamId, "JWT.iss", "APPLE_TEAM_ID"),
    ...claimCheck("jwt-sub-matches", payload.sub, ids.servicesId, "JWT.sub", "APPLE_SERVICES_ID"),
  );
  return checks;
}

async function servicesIdChecks(creds: AscCredentials, servicesId: string): Promise<Check[]> {
  try {
    const matches = await makeAscClient(creds).bundleIds.list({ identifier: servicesId });
    if (matches.length > 0) {
      return [ok("apple", "services-id-exists", `${servicesId} found in ASC`)];
    }
    return [
      fail(
        "apple",
        "services-id-exists",
        `${servicesId} not found in App Store Connect`,
        "run `npx vexpo apple services-id` to provision it",
      ),
    ];
  } catch (e) {
    return [warn("apple", "services-id-lookup", `ASC lookup failed: ${errText(e)}`)];
  }
}

async function ascKeyChecks(
  creds: AscCredentials | null,
  servicesId: string | undefined,
): Promise<Check[]> {
  if (!creds) {
    return [skip("apple", "asc-key-valid", "no cached ASC creds (run `npx vexpo apple asc-key`)")];
  }
  const v = await ascValidate(creds);
  if (!v.ok) return [fail("apple", "asc-key-valid", v.reason)];
  return [
    ok("apple", "asc-key-valid", `${v.appCount} app${plural(v.appCount)}`),
    ...(servicesId ? await servicesIdChecks(creds, servicesId) : []),
  ];
}

async function verifyApple(ctx: VerifyContext): Promise<Check[]> {
  const env = convexEnvFor(ctx);
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const ids: AppleIds = {
    servicesId: env?.get("APPLE_CLIENT_ID") ?? local.get("APPLE_SERVICES_ID"),
    teamId: env?.get("APPLE_TEAM_ID") ?? local.get("EXPO_PUBLIC_APPLE_TEAM_ID"),
    keyId: env?.get("APPLE_KEY_ID"),
  };
  const jwt = env?.get("APPLE_CLIENT_SECRET");

  const jwtChecks =
    env === null
      ? []
      : jwt
        ? appleJwtChecks(jwt, ids)
        : [skip("apple", "jwt-decode", "APPLE_CLIENT_SECRET not set (Apple Sign In disabled)")];

  return [
    ...appleIdFormatChecks(env, ids, ctx.channel),
    ...jwtChecks,
    ...(await ascKeyChecks(ctx.ascCreds, ids.servicesId)),
  ];
}

type EasEnvName = "production" | "preview" | "development";
const EAS_ENVS: readonly EasEnvName[] = ["production", "preview", "development"];

async function easSignInCheck(): Promise<{ signedIn: boolean; check: Check }> {
  try {
    const who = await easWhoami();
    return {
      signedIn: !!who,
      check: who
        ? ok("eas", "signed-in", who)
        : warn("eas", "signed-in", "not signed in (run `npx eas-cli login`)"),
    };
  } catch {
    return { signedIn: false, check: skip("eas", "signed-in", "eas CLI not available") };
  }
}

function easProjectIdCheck(projectId: string | null, provisioned: boolean): Check {
  if (projectId) return ok("eas", "project-id", projectId);
  if (provisioned) {
    return warn(
      "eas",
      "project-id",
      "EAS env is provisioned but projectId is unresolved",
      "set EAS_PROJECT_ID in .env.local (app.json is intentionally stubbed)",
    );
  }
  return fail("eas", "project-id", "no projectId in app.json, EAS_PROJECT_ID env, or .env.local");
}

async function easProjectInfoChecks(projectId: string | null, signedIn: boolean): Promise<Check[]> {
  if (!projectId) return [];
  try {
    const info = await easProjectInfo();
    if (info && info.id === projectId) return [ok("eas", "project-info", info.fullName)];
    if (info) {
      return [
        fail(
          "eas",
          "project-info",
          `local projectId (${projectId}) doesn't match resolved project (${info.id})`,
          "run `eas init` to re-link (or `vexpo full`)",
        ),
      ];
    }
    if (!signedIn) return [skip("eas", "project-info", "not signed in")];
    return [
      warn("eas", "project-info", "eas project:info failed (project deleted or transferred?)"),
    ];
  } catch {
    return [skip("eas", "project-info", "eas-cli not available")];
  }
}

function convexUrlDriftChecks(env: EasEnvName, expected?: string, actual?: string): Check[] {
  if (!expected || !actual) return [];
  const expSlug = deploymentSlugFromHost(hostnameOf(expected) ?? "");
  const actSlug = deploymentSlugFromHost(hostnameOf(actual) ?? "");
  if (!expSlug || !actSlug) return [];
  if (expSlug === actSlug) return [ok("eas", `convex-url-${env}`, `points at ${actSlug}`)];
  return [
    fail(
      "eas",
      `convex-url-${env}`,
      `EAS points at ${actSlug}, local at ${expSlug}`,
      "run `vexpo env push` + `vexpo env convex-key` to repoint EAS at the active deployment",
    ),
  ];
}

function rotationSecretChecks(list: Map<string, string>): Check[] {
  const missing = [
    "CONVEX_DEPLOY_KEY",
    "APPLE_P8_PRIVATE_KEY",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_SERVICES_ID",
  ].filter((k) => !list.has(k));
  if (missing.length === 0) return [ok("eas", "rotation-secrets", "all 5 present (production)")];
  return [
    warn(
      "eas",
      "rotation-secrets",
      `missing ${missing.join(", ")}`,
      "set with `eas env:create --visibility secret --environment production`",
    ),
  ];
}

function easEnvChecks(
  env: EasEnvName,
  list: Map<string, string> | null,
  ctx: VerifyContext,
): Check[] {
  if (!list) return [skip("eas", `env-${env}`, "eas env:list unavailable")];

  const missing = ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_APP_BUNDLE_ID"].filter(
    (k) => !list.has(k),
  );
  const presence =
    missing.length === 0
      ? ok("eas", `env-${env}`, "required vars present")
      : warn(
          "eas",
          `env-${env}`,
          `missing ${missing.join(", ")}`,
          "run `npx vexpo full` to init EAS + mirror env",
        );

  const local = env === "development" ? ctx.envLocal : ctx.envProd;
  return [
    presence,
    ...convexUrlDriftChecks(
      env,
      local.get("EXPO_PUBLIC_CONVEX_URL"),
      list.get("EXPO_PUBLIC_CONVEX_URL"),
    ),
    ...(env === "production" ? rotationSecretChecks(list) : []),
  ];
}

function ascSubmitIdChecks(): Check[] {
  if (!existsSync("eas.json")) return [];
  const missing = submitProfilesMissingAscAppId(readFileSync("eas.json", "utf8"));
  if (missing.length === 0) return [ok("eas", "asc-submit-id", "submit profiles carry ascAppId")];
  return [
    warn(
      "eas",
      "asc-submit-id",
      `submit profile${plural(missing.length)} ${missing.join(", ")} missing ascAppId`,
      "run `vexpo asc connect` to write it; non-interactive `eas submit` (CI) fails without it",
    ),
  ];
}

async function ascIntegrationChecks(): Promise<Check[]> {
  try {
    const status = await ascStatus();
    if (status.status !== "connected") {
      return [
        warn(
          "eas",
          "asc-integration",
          `not connected (${status.status})`,
          "run `vexpo asc connect` in a terminal; if the key picker shows only stale keys, its create-or-upload entry mints the EAS-managed key (a second key alongside eas.json's is by design)",
        ),
      ];
    }
    return [
      ok("eas", "asc-integration", status.appStoreConnectApp?.bundleIdentifier ?? "connected"),
      ...ascSubmitIdChecks(),
    ];
  } catch {
    return [skip("eas", "asc-integration", "eas integrations:asc:status unavailable")];
  }
}

async function verifyEas(ctx: VerifyContext): Promise<Check[]> {
  let projectId: string | null = null;
  try {
    projectId = await resolveProjectId();
  } catch {}

  if (!projectId) {
    const rev = convexEnvFor(ctx)?.get("REQUIRE_EMAIL_VERIFICATION");
    if (!rev || rev === "false") {
      return [skip("eas", "project-id", "lite mode (run `npx vexpo full` to init EAS)")];
    }
  }

  const signIn = await easSignInCheck();
  const checks: Check[] = [signIn.check];

  const envMaps = new Map<EasEnvName, Map<string, string> | null>();
  for (const e of EAS_ENVS) envMaps.set(e, await easEnvList(e));
  const provisioned = [...envMaps.values()].some((m) => m !== null && m.size > 0);

  const idCheck = easProjectIdCheck(projectId, provisioned);
  checks.push(idCheck);
  if (idCheck.severity === "fail") return checks;

  checks.push(...(await easProjectInfoChecks(projectId, signIn.signedIn)));
  for (const env of EAS_ENVS) checks.push(...easEnvChecks(env, envMaps.get(env) ?? null, ctx));
  checks.push(...(await ascIntegrationChecks()));
  return checks;
}

function matchCheck(
  name: string,
  message: string,
  a: string | undefined,
  b: string | undefined,
): Check[] {
  if (!a || !b) return [];
  return a === b ? [ok("coherence", name, a)] : [fail("coherence", name, message)];
}

function bundleIdChecks(
  ctx: VerifyContext,
  local: Map<string, string>,
  env: Map<string, string>,
): Check[] {
  const expoBundle = local.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  const convexBundle = env.get("APP_BUNDLE_ID");
  const matched = matchCheck(
    "bundle-id-match",
    `EXPO_PUBLIC_APP_BUNDLE_ID='${expoBundle}' ≠ Convex APP_BUNDLE_ID='${convexBundle}'`,
    expoBundle,
    convexBundle,
  );
  if (matched.length > 0) return matched;

  const fallback = ctx.appConfig.bundleIdFallback;
  if (!expoBundle || !fallback) return [];
  if (expoBundle === fallback) return [ok("coherence", "bundle-id-config", expoBundle)];
  return [
    warn(
      "coherence",
      "bundle-id-config",
      `EXPO_PUBLIC_APP_BUNDLE_ID='${expoBundle}' ≠ app.config.ts fallback '${fallback}'`,
    ),
  ];
}

function siteUrlChecks(local: Map<string, string>, env: Map<string, string>): Check[] {
  const expoSite = local.get("EXPO_PUBLIC_CONVEX_SITE_URL");
  const convexSite = env.get("SITE_URL");
  const localSite = local.get("EXPO_PUBLIC_SITE_URL");
  if (!expoSite || !convexSite || !localSite) return [];
  if (convexSite === localSite || convexSite.startsWith(localSite)) return [];
  return [
    warn(
      "coherence",
      "site-url-match",
      `Convex SITE_URL='${convexSite}' ≠ EXPO_PUBLIC_SITE_URL='${localSite}'`,
    ),
  ];
}

function appNameChecks(ctx: VerifyContext, env: Map<string, string>): Check[] {
  const expected = ctx.appConfig.name;
  const convexName = env.get("APP_NAME");
  if (!expected || !convexName) return [];
  const matches =
    convexName === expected ||
    (ctx.channel === "dev" &&
      (convexName === `${expected} (Dev)` || convexName === `${expected} Dev`));
  if (matches) return [ok("coherence", "app-name-match", convexName)];
  return [
    warn(
      "coherence",
      "app-name-match",
      `APP_NAME='${convexName}' ≠ app.config.ts name='${expected}'`,
    ),
  ];
}

function verifyCoherence(ctx: VerifyContext): Check[] {
  const env = convexEnvFor(ctx) ?? new Map<string, string>();
  const local = ctx.channel === "prod" ? ctx.envProd : ctx.envLocal;
  const expoTeam = local.get("EXPO_PUBLIC_APPLE_TEAM_ID");
  const convexTeam = env.get("APPLE_TEAM_ID");
  const localServices = local.get("APPLE_SERVICES_ID");
  const convexServices = env.get("APPLE_CLIENT_ID");

  return [
    ...bundleIdChecks(ctx, local, env),
    ...matchCheck(
      "team-id-match",
      `EXPO_PUBLIC_APPLE_TEAM_ID='${expoTeam}' ≠ Convex APPLE_TEAM_ID='${convexTeam}'`,
      expoTeam,
      convexTeam,
    ),
    ...matchCheck(
      "services-id-match",
      `APPLE_SERVICES_ID='${localServices}' ≠ Convex APPLE_CLIENT_ID='${convexServices}'`,
      localServices,
      convexServices,
    ),
    ...siteUrlChecks(local, env),
    ...appNameChecks(ctx, env),
  ];
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
        `missing ${missing.length} key${plural(missing.length)}`,
        missing.join(", "),
      ),
    );
  return checks;
}

export async function readContext(channel: Channel): Promise<VerifyContext> {
  const prodEnvFile = (await findProdEnvFile()) ?? undefined;
  const [envLocal, envProd, convexEnv, convexProdEnv, appConfigFacts, ascCreds] = await Promise.all(
    [
      readEnvFile(".env.local"),
      readEnvFile(".env.prod").then(async (m) => (m.size > 0 ? m : readEnvFile(".env.production"))),
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
