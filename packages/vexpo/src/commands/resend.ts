import { pkgName } from "../lib/app.ts";
import { envSet, type ConvexTarget } from "../lib/convex-env.ts";
import { findProdEnvFile, readEnvFile } from "../lib/env-files.ts";
import { readOne } from "../lib/env-local.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  bad,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../lib/output.ts";
import { formatElapsed, poll } from "../lib/poll.ts";
import {
  deleteWebhook,
  getDomain,
  listDomains,
  listWebhooks,
  probeAccess,
  provisionSendingKey,
  provisionWebhook,
  verifyDomain,
  type ResendDomain,
  type ResendWebhook,
} from "../lib/resend-api.ts";
import { load as loadState, recordStep } from "../lib/state.ts";

export type ResendOptions = {
  name?: string;
  from?: string;
  repoint?: boolean;
  prod?: boolean;
  force?: boolean;
};

async function resolveFullKey(): Promise<string | null> {
  const fromEnv = process.env.RESEND_FULL_ACCESS_KEY;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return null;
  line();
  note("Need a Resend full-access API key. Create one at:");
  note(`  ${BOLD}https://resend.com/api-keys${RESET} → Create API Key → Permission: Full Access`);
  note("Used once, never persisted. Don't edit its permission in the dashboard");
  note("mid-run: editing a key's permission rotates its token.");
  const pasted = await ask(`  RESEND_FULL_ACCESS_KEY > `);
  return pasted || null;
}

async function prodChannel(): Promise<{ envFile: string; siteUrl: string } | null> {
  const envFile = await findProdEnvFile();
  if (!envFile) return null;
  const siteUrl = (await readEnvFile(envFile)).get("EXPO_PUBLIC_CONVEX_SITE_URL");
  return siteUrl ? { envFile, siteUrl } : null;
}

async function ensureVerifiedDomains(fullKey: string): Promise<ResendDomain[] | null> {
  const verified = (await listDomains(fullKey)).filter((d) => d.status === "verified");
  if (verified.length > 0) return verified;

  yep("no verified Resend domains. Walk through the manual setup once:");
  note("  1. Add Domain in the Resend dashboard (apex domain you control)");
  note("  2. Resend shows 3-5 DNS records (SPF, DKIM, MX-send, optional return-path CNAME)");
  note("  3. Add records at your DNS registrar (GoDaddy, Cloudflare, Vercel, etc.)");
  note("  4. Click Verify in the Resend dashboard. Apex domains with `p=reject` DMARC defaults");
  note("     (GoDaddy ships these) need both SPF + DKIM in place before any mail will deliver.");
  note("  5. Set Custom Return-Path on, click/open tracking off, TLS Enforced.");
  line();
  await helpAndWait({
    body: "Open the Resend domains page:",
    urls: [{ label: "Resend domains", url: "https://resend.com/domains" }],
    allowSkip: false,
  });

  const all = await listDomains(fullKey);
  const pending = all.filter((d) => d.status !== "verified");
  if (pending.length === 0) {
    bad("no domains added yet in Resend. Add one in the dashboard, then re-run.");
    return null;
  }
  const target = pending[pending.length - 1];
  note(`polling ${BOLD}${target.name}${RESET} for verified status (every 30s, max 10 min)...`);
  note(
    `${DIM}DNS propagation timing depends on your registrar. Some are seconds, some are an hour.${RESET}`,
  );

  const result = await poll<ResendDomain>({
    intervalMs: 30_000,
    timeoutMs: 10 * 60 * 1000,
    check: async () => {
      try {
        await verifyDomain(fullKey, target.id);
      } catch {}
      const refreshed = await getDomain(fullKey, target.id);
      if (refreshed.status === "verified") {
        return {
          done: true,
          value: { id: refreshed.id, name: refreshed.name, status: refreshed.status },
        };
      }
      return { done: false, reason: refreshed.status };
    },
    tick: ({ attempts, elapsedMs, reason }) => {
      nop(
        `still ${reason ?? "pending"} (attempt ${attempts}, ${formatElapsed(elapsedMs)} elapsed)`,
      );
    },
  });

  if (!result.done) {
    bad(
      `${target.name} not verified after ${formatElapsed(result.elapsedMs)} (${result.attempts} polls)`,
    );
    note("DNS records may still be propagating. Re-run `vexpo resend` later.");
    note(`Or check the dashboard: ${BOLD}https://resend.com/domains/${target.id}${RESET}`);
    return null;
  }
  ok(`${target.name} verified after ${formatElapsed(result.elapsedMs)}`);
  ok(`${target.name} verified after ${formatElapsed(result.elapsedMs)}`);
  return [result.value];
}

function pickDomain(verified: ResendDomain[]): Promise<ResendDomain> | ResendDomain {
  if (verified.length === 1) return verified[0];
  if (!process.stdin.isTTY) {
    yep(`multiple verified domains; non-TTY → picking first: ${verified[0].name}`);
    return verified[0];
  }
  line();
  note("Verified domains:");
  verified.forEach((d, i) => note(`  ${i + 1}. ${d.name}`));
  return ask(`  Pick (1-${verified.length}, default 1) > `).then(
    (raw) => verified[parseInt(raw || "1", 10) - 1] ?? verified[0],
  );
}

async function syncProdChannel(
  fullKey: string,
  siteUrl: string,
  token: string,
  fromAddr: string,
): Promise<{ id: string; endpoint: string } | undefined> {
  const prod = await prodChannel();
  if (!prod) {
    nop(
      "no prod site URL yet; prod channel skipped (re-run after `CONVEX_DEPLOY_KEY= npx convex deploy`)",
    );
    return undefined;
  }
  if (prod.siteUrl === siteUrl) {
    nop("prod site URL matches dev; prod channel skipped");
    return undefined;
  }
  const target: ConvexTarget = { prod: true, envFile: prod.envFile };
  const prodEndpoint = `${prod.siteUrl.replace(/\/$/, "")}/resend-webhook`;
  const created = await provisionWebhook(fullKey, prodEndpoint);
  ok(`webhook → ${prodEndpoint}`);
  await envSet("RESEND_API_KEY", token, target);
  await envSet("RESEND_WEBHOOK_SECRET", created.secret, target);
  await envSet("EMAIL_FROM", fromAddr, target);
  await envSet("RESEND_TEST_MODE", "false", target);
  await envSet("REQUIRE_EMAIL_VERIFICATION", "true", target);
  ok("prod deployment env aligned (same sending key, its own webhook secret)");
  return { id: created.id, endpoint: prodEndpoint };
}

async function requireFullKey(): Promise<string | null> {
  const fullKey = await resolveFullKey();
  if (!fullKey) {
    if (process.stdin.isTTY) bad("aborted");
    else bad("no RESEND_FULL_ACCESS_KEY env var and no TTY for paste");
    return null;
  }
  const access = await probeAccess(fullKey);
  if (access !== "full") {
    bad(`provided key has '${access}' access; need 'full'`);
    return null;
  }
  ok("full-access key verified");
  return fullKey;
}

async function resolveRepointTarget(
  prod: boolean,
): Promise<{ siteUrl: string; convexTarget?: ConvexTarget } | null> {
  if (!prod) {
    const siteUrl = await readOne("EXPO_PUBLIC_CONVEX_SITE_URL");
    return siteUrl ? { siteUrl } : null;
  }
  const envFile = (await findProdEnvFile()) ?? ".env.production";
  const siteUrl = (await readEnvFile(envFile)).get("EXPO_PUBLIC_CONVEX_SITE_URL");
  return siteUrl ? { siteUrl, convexTarget: { prod: true, envFile } } : null;
}

async function siblingWebhookEndpoint(prod: boolean): Promise<string | undefined> {
  const site = prod ? await readOne("EXPO_PUBLIC_CONVEX_SITE_URL") : (await prodChannel())?.siteUrl;
  return site ? `${site.replace(/\/$/, "")}/resend-webhook` : undefined;
}

export async function runResend(options: ResendOptions): Promise<number> {
  if (options.repoint) return runResendRepoint(options);

  section("Resend provisioning");
  if (options.prod) {
    nop("--prod pairs with --repoint; the full flow wires dev and prod itself");
  }

  const siteUrl = await readOne("EXPO_PUBLIC_CONVEX_SITE_URL");
  if (!siteUrl) {
    bad("EXPO_PUBLIC_CONVEX_SITE_URL missing from .env.local");
    note("run `vexpo convex` first to populate it");
    return 1;
  }
  ok(`Convex site: ${siteUrl}`);

  const name = options.name ?? (await pkgName());

  const fullKey = await requireFullKey();
  if (!fullKey) return 1;

  const verified = await ensureVerifiedDomains(fullKey);
  if (!verified) return 1;
  const domain = await pickDomain(verified);
  ok(`domain: ${domain.name}`);

  const token = await provisionSendingKey(fullKey, name, domain.id);
  ok(`scoped sending key '${name}' provisioned`);

  const endpoint = `${siteUrl.replace(/\/$/, "")}/resend-webhook`;
  const { id: webhookId, secret } = await provisionWebhook(fullKey, endpoint);
  ok(`webhook → ${endpoint}`);

  const fromAddr = options.from ?? `${name}@${domain.name}`;

  await envSet("RESEND_API_KEY", token);
  ok("RESEND_API_KEY set on Convex");
  await envSet("RESEND_WEBHOOK_SECRET", secret);
  ok("RESEND_WEBHOOK_SECRET set on Convex");
  await envSet("EMAIL_FROM", fromAddr);
  ok(`EMAIL_FROM=${fromAddr} set on Convex`);
  await envSet("RESEND_TEST_MODE", "false");
  ok("RESEND_TEST_MODE=false (sends to real addresses)");
  await envSet("REQUIRE_EMAIL_VERIFICATION", "true");
  ok("REQUIRE_EMAIL_VERIFICATION=true (sign-up now requires OTP)");

  const prodWebhook = await syncProdChannel(fullKey, siteUrl, token, fromAddr);

  await recordStep("resend", {
    domainId: domain.id,
    domainName: domain.name,
    keyName: name,
    fromAddress: fromAddr,
    webhookEndpoint: endpoint,
    webhookId,
    ...(prodWebhook
      ? { prodWebhookEndpoint: prodWebhook.endpoint, prodWebhookId: prodWebhook.id }
      : {}),
  });

  line();
  ok("Resend provisioning complete");
  yep("clear the full-access key from your shell history if pasted");
  note(`next: add the DNS records at your registrar so this domain can send mail`);
  note(
    `     ${DIM}https://resend.com/domains/${domain.id}${RESET} shows the records + verification status`,
  );
  return 0;
}

function keepWebhook(existing: { id: string }, endpoint: string): string {
  ok(`webhook already points at ${endpoint}`);
  note("pass --force to recreate the webhook and realign RESEND_WEBHOOK_SECRET");
  return existing.id;
}

async function recreateWebhook(
  fullKey: string,
  endpoint: string,
  convexTarget: ConvexTarget | undefined,
  channel: string,
): Promise<string> {
  const { id, secret } = await provisionWebhook(fullKey, endpoint);
  ok(`webhook → ${endpoint}`);
  await envSet("RESEND_WEBHOOK_SECRET", secret, convexTarget);
  ok(`RESEND_WEBHOOK_SECRET aligned on the ${channel} deployment`);
  return id;
}

async function retireStale(fullKey: string, stale: ResendWebhook[]): Promise<number> {
  for (const webhook of stale) {
    await deleteWebhook(fullKey, webhook.id);
    note(`retired stale webhook → ${webhook.endpoint}`);
  }
  return stale.length;
}

async function runResendRepoint(options: ResendOptions): Promise<number> {
  const channel = options.prod ? "prod" : "dev";
  section(`Resend repoint (${channel})`);

  const target = await resolveRepointTarget(options.prod === true);
  if (!target) {
    bad(`EXPO_PUBLIC_CONVEX_SITE_URL missing from ${options.prod ? ".env.prod" : ".env.local"}`);
    note("run `vexpo convex` (and a prod deploy) so the site URL is populated, then re-run");
    return 1;
  }
  const { siteUrl, convexTarget } = target;
  const endpoint = `${siteUrl.replace(/\/$/, "")}/resend-webhook`;
  ok(`target endpoint: ${endpoint}`);

  const fullKey = await requireFullKey();
  if (!fullKey) return 1;

  const siblingEndpoint = await siblingWebhookEndpoint(options.prod === true);

  const hooks = await listWebhooks(fullKey);
  const atNew = hooks.find((w) => w.endpoint === endpoint);
  const stale = hooks.filter(
    (w) =>
      w.endpoint !== endpoint &&
      w.endpoint !== siblingEndpoint &&
      w.endpoint.endsWith("/resend-webhook"),
  );

  const webhookId =
    atNew && !options.force
      ? keepWebhook(atNew, endpoint)
      : await recreateWebhook(fullKey, endpoint, convexTarget, channel);

  const retired = await retireStale(fullKey, stale);

  const prev = (await loadState()).steps.resend?.outputs ?? {};
  await recordStep("resend", { ...prev, webhookEndpoint: endpoint, webhookId });

  line();
  ok(`repoint complete${retired ? ` (${retired} stale retired)` : ""}`);
  nop("sending key and REQUIRE_EMAIL_VERIFICATION left unchanged");
  return 0;
}
