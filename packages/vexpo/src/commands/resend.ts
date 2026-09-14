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
  createSendingKey,
  createWebhook,
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
  note(`  ${BOLD}https://resend.com/api-keys${RESET}, Create API Key, permission Full Access`);
  note("It's used once and never saved. Don't change its permission in the");
  note("dashboard while this runs, that gives the key a new token.");
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

  yep("no verified Resend domains yet. Set one up once:");
  note("  1. Add Domain in the Resend dashboard, a domain you own");
  note("  2. Resend shows a few DNS records (SPF, DKIM, an MX, and a return-path CNAME)");
  note("  3. add them at your registrar (GoDaddy, Cloudflare, Vercel, and so on)");
  note("  4. click Verify in the Resend dashboard. A domain with a `p=reject` DMARC record");
  note("     (GoDaddy adds one by default) needs both SPF and DKIM in place before mail delivers");
  note("  5. turn Custom Return-Path on, click and open tracking off, TLS to Enforced");
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
  note(`checking ${BOLD}${target.name}${RESET} every 30s for up to 10 minutes...`);
  note(`${DIM}DNS changes take seconds at some registrars and an hour at others.${RESET}`);

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
    note("the DNS records may still be spreading. Run `vexpo resend` again later.");
    note(`or check the dashboard: ${BOLD}https://resend.com/domains/${target.id}${RESET}`);
    return null;
  }
  ok(`${target.name} verified after ${formatElapsed(result.elapsedMs)}`);
  return [result.value];
}

function pickDomain(verified: ResendDomain[]): Promise<ResendDomain> | ResendDomain {
  if (verified.length === 1) return verified[0];
  if (!process.stdin.isTTY) {
    yep(`several verified domains and no terminal to ask in, using the first: ${verified[0].name}`);
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
      "no prod site URL yet, prod skipped (run again after `CONVEX_DEPLOY_KEY= npx convex deploy`)",
    );
    return undefined;
  }
  if (prod.siteUrl === siteUrl) {
    nop("the prod site URL is the same as dev, prod skipped");
    return undefined;
  }
  const target: ConvexTarget = { prod: true, envFile: prod.envFile };
  const prodEndpoint = `${prod.siteUrl.replace(/\/$/, "")}/resend-webhook`;
  const created = await createWebhook(fullKey, prodEndpoint);
  ok(`webhook at ${prodEndpoint}`);
  await envSet("RESEND_API_KEY", token, target);
  await envSet("RESEND_WEBHOOK_SECRET", created.secret, target);
  await envSet("EMAIL_FROM", fromAddr, target);
  await envSet("RESEND_TEST_MODE", "false", target);
  await envSet("REQUIRE_EMAIL_VERIFICATION", "true", target);
  ok("prod deployment set (same sending key, its own webhook secret)");
  return { id: created.id, endpoint: prodEndpoint };
}

async function requireFullKey(): Promise<string | null> {
  const fullKey = await resolveFullKey();
  if (!fullKey) {
    if (process.stdin.isTTY) bad("no key given, stopping");
    else bad("RESEND_FULL_ACCESS_KEY is not set and there's no terminal to paste it in");
    return null;
  }
  const access = await probeAccess(fullKey);
  if (access !== "full") {
    bad(`that key has '${access}' access, it needs 'full'`);
    return null;
  }
  ok("full-access key works");
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

  section("Resend");
  if (options.prod) {
    nop("--prod only goes with --repoint. The full run sets up dev and prod itself");
  }

  const siteUrl = await readOne("EXPO_PUBLIC_CONVEX_SITE_URL");
  if (!siteUrl) {
    bad("EXPO_PUBLIC_CONVEX_SITE_URL missing from .env.local");
    note("run `vexpo convex` first, it writes it");
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

  const token = await createSendingKey(fullKey, name, domain.id);
  ok(`created the sending key '${name}'`);

  const endpoint = `${siteUrl.replace(/\/$/, "")}/resend-webhook`;
  const { id: webhookId, secret } = await createWebhook(fullKey, endpoint);
  ok(`webhook at ${endpoint}`);

  const fromAddr = options.from ?? `${name}@${domain.name}`;

  const convexWrites: Array<[string, string, string]> = [
    ["RESEND_API_KEY", token, "RESEND_API_KEY set on Convex"],
    ["RESEND_WEBHOOK_SECRET", secret, "RESEND_WEBHOOK_SECRET set on Convex"],
    ["EMAIL_FROM", fromAddr, `EMAIL_FROM=${fromAddr} set on Convex`],
    ["RESEND_TEST_MODE", "false", "RESEND_TEST_MODE=false (sends to real addresses)"],
    [
      "REQUIRE_EMAIL_VERIFICATION",
      "true",
      "REQUIRE_EMAIL_VERIFICATION=true (sign-up now asks for the email code)",
    ],
  ];
  for (const [key, value, message] of convexWrites) {
    await envSet(key, value);
    ok(message);
  }

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
  ok("Resend set up");
  yep("if you pasted the full-access key, clear it from your shell history");
  note("next: add the DNS records at your registrar so this domain can send mail");
  note(
    `     ${DIM}https://resend.com/domains/${domain.id}${RESET} shows the records and their status`,
  );
  return 0;
}

function keepWebhook(existing: { id: string }, endpoint: string): string {
  ok(`webhook already points at ${endpoint}`);
  note("pass --force to recreate it and set a new RESEND_WEBHOOK_SECRET");
  return existing.id;
}

async function recreateWebhook(
  fullKey: string,
  endpoint: string,
  convexTarget: ConvexTarget | undefined,
  channel: string,
): Promise<string> {
  const { id, secret } = await createWebhook(fullKey, endpoint);
  ok(`webhook at ${endpoint}`);
  await envSet("RESEND_WEBHOOK_SECRET", secret, convexTarget);
  ok(`RESEND_WEBHOOK_SECRET set on the ${channel} deployment`);
  return id;
}

async function retireStale(fullKey: string, stale: ResendWebhook[]): Promise<number> {
  for (const webhook of stale) {
    await deleteWebhook(fullKey, webhook.id);
    note(`deleted the old webhook at ${webhook.endpoint}`);
  }
  return stale.length;
}

async function runResendRepoint(options: ResendOptions): Promise<number> {
  const channel = options.prod ? "prod" : "dev";
  section(`Resend repoint (${channel})`);

  const target = await resolveRepointTarget(options.prod === true);
  if (!target) {
    bad(`EXPO_PUBLIC_CONVEX_SITE_URL missing from ${options.prod ? ".env.prod" : ".env.local"}`);
    note("run `vexpo convex` (and a prod deploy) to get the site URL, then try again");
    return 1;
  }
  const { siteUrl, convexTarget } = target;
  const endpoint = `${siteUrl.replace(/\/$/, "")}/resend-webhook`;
  ok(`new endpoint: ${endpoint}`);

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
  ok(`webhook moved${retired ? ` (${retired} old one${retired === 1 ? "" : "s"} deleted)` : ""}`);
  nop("the sending key and REQUIRE_EMAIL_VERIFICATION are unchanged");
  return 0;
}
