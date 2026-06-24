import { access } from "node:fs/promises";

import { pkgName } from "../lib/app.ts";
import { envSet, type ConvexTarget } from "../lib/convex-env.ts";
import { readEnvFile } from "../lib/env-files.ts";
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
} from "../lib/resend-api.ts";
import { load as loadState, recordStep } from "../lib/state.ts";

export type ResendOptions = {
  name?: string;
  from?: string;
  repoint?: boolean;
  prod?: boolean;
  force?: boolean;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveFullKey(): Promise<string | null> {
  const fromEnv = process.env.RESEND_FULL_ACCESS_KEY;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return null;
  line();
  note("Need a Resend full-access API key. Create one at:");
  note(`  ${BOLD}https://resend.com/api-keys${RESET} → Create API Key → Permission: Full Access`);
  note("Used once, never persisted.");
  const pasted = await ask(`  RESEND_FULL_ACCESS_KEY > `);
  return pasted || null;
}

export async function runResend(options: ResendOptions): Promise<number> {
  if (options.repoint) return runResendRepoint(options);

  section("Resend provisioning");

  const siteUrl = await readOne("EXPO_PUBLIC_CONVEX_SITE_URL");
  if (!siteUrl) {
    bad("EXPO_PUBLIC_CONVEX_SITE_URL missing from .env.local");
    note("run `vexpo convex` first to populate it");
    return 1;
  }
  ok(`Convex site: ${siteUrl}`);

  const name = options.name ?? (await pkgName());

  let fullKey = process.env.RESEND_FULL_ACCESS_KEY;
  if (!fullKey) {
    if (!process.stdin.isTTY) {
      bad("no RESEND_FULL_ACCESS_KEY env var and no TTY for paste");
      return 1;
    }
    line();
    note("Need a Resend full-access API key. Create one at:");
    note(`  ${BOLD}https://resend.com/api-keys${RESET} → Create API Key → Permission: Full Access`);
    note("Used once to provision a scoped sending key + webhook, then discarded.");
    line();
    fullKey = await ask(`  RESEND_FULL_ACCESS_KEY > `);
    if (!fullKey) {
      bad("aborted");
      return 1;
    }
  }

  const keyAccess = await probeAccess(fullKey);
  if (keyAccess !== "full") {
    bad(`provided key has '${keyAccess}' access; need 'full'`);
    return 1;
  }
  ok("full-access key verified");

  let verified = (await listDomains(fullKey)).filter((d) => d.status === "verified");
  if (verified.length === 0) {
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
      return 1;
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
        } catch {
          // Resend returns 422 while DNS isn't ready; ignore and re-check.
        }
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
      return 1;
    }
    ok(`${target.name} verified after ${formatElapsed(result.elapsedMs)}`);
    verified = [result.value];
  }
  let domain: ResendDomain;
  if (verified.length === 1) {
    domain = verified[0];
  } else if (!process.stdin.isTTY) {
    domain = verified[0];
    yep(`multiple verified domains; non-TTY → picking first: ${domain.name}`);
  } else {
    line();
    note("Verified domains:");
    verified.forEach((d, i) => note(`  ${i + 1}. ${d.name}`));
    const raw = (await ask(`  Pick (1-${verified.length}, default 1) > `)) || "1";
    const idx = parseInt(raw, 10);
    domain = verified[idx - 1] ?? verified[0];
  }
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

  await recordStep("resend", {
    domainId: domain.id,
    domainName: domain.name,
    keyName: name,
    fromAddress: fromAddr,
    webhookEndpoint: endpoint,
    webhookId,
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

/**
 * Resend's API can't read a signing secret back or edit an endpoint in place,
 * so moving the webhook mints a fresh secret; we write it onto the deployment
 * atomically so signature verification keeps working.
 */
async function runResendRepoint(options: ResendOptions): Promise<number> {
  const channel = options.prod ? "prod" : "dev";
  section(`Resend repoint (${channel})`);

  let siteUrl: string | undefined;
  let convexTarget: ConvexTarget | undefined;
  if (options.prod) {
    const prodFile = (await fileExists(".env.prod")) ? ".env.prod" : ".env.production";
    siteUrl = (await readEnvFile(prodFile)).get("EXPO_PUBLIC_CONVEX_SITE_URL");
    convexTarget = { prod: true, envFile: prodFile };
  } else {
    siteUrl = (await readOne("EXPO_PUBLIC_CONVEX_SITE_URL")) ?? undefined;
  }
  if (!siteUrl) {
    bad(`EXPO_PUBLIC_CONVEX_SITE_URL missing from ${options.prod ? ".env.prod" : ".env.local"}`);
    note("run `vexpo convex` (and a prod deploy) so the site URL is populated, then re-run");
    return 1;
  }
  const endpoint = `${siteUrl.replace(/\/$/, "")}/resend-webhook`;
  ok(`target endpoint: ${endpoint}`);

  const fullKey = await resolveFullKey();
  if (!fullKey) {
    bad("no RESEND_FULL_ACCESS_KEY env var and no TTY for paste");
    return 1;
  }
  if ((await probeAccess(fullKey)) !== "full") {
    bad("provided key does not have full access");
    return 1;
  }

  const hooks = await listWebhooks(fullKey);
  const atNew = hooks.find((w) => w.endpoint === endpoint);
  const stale = hooks.filter(
    (w) => w.endpoint !== endpoint && w.endpoint.endsWith("/resend-webhook"),
  );

  let webhookId: string | undefined;
  if (atNew && !options.force) {
    ok(`webhook already points at ${endpoint}`);
    note("its secret can't be read back; pass --force to recreate + realign RESEND_WEBHOOK_SECRET");
    webhookId = atNew.id;
  } else {
    const { id, secret } = await provisionWebhook(fullKey, endpoint);
    webhookId = id;
    ok(`webhook → ${endpoint}`);
    await envSet("RESEND_WEBHOOK_SECRET", secret, convexTarget);
    ok(`RESEND_WEBHOOK_SECRET aligned on the ${channel} deployment`);
  }

  let retired = 0;
  for (const w of stale) {
    await deleteWebhook(fullKey, w.id);
    note(`retired stale webhook → ${w.endpoint}`);
    retired += 1;
  }

  const prev = (await loadState()).steps.resend?.outputs ?? {};
  await recordStep("resend", { ...prev, webhookEndpoint: endpoint, webhookId });

  line();
  ok(`repoint complete${retired ? ` (${retired} stale retired)` : ""}`);
  nop("sending key and REQUIRE_EMAIL_VERIFICATION left unchanged");
  return 0;
}
