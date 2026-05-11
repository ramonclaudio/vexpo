/**
 * `vexpo resend`. provisions a scoped sending API key + webhook against your
 * Resend account, points the webhook at the current Convex deployment, and
 * writes RESEND_API_KEY + RESEND_WEBHOOK_SECRET + EMAIL_FROM + RESEND_TEST_MODE
 * to the dev Convex env. Idempotent: re-runs delete the matching key + webhook
 * before creating fresh ones.
 *
 * Reads the full-access key from RESEND_FULL_ACCESS_KEY env var, or prompts
 * interactively. The full-access key is used only during this command and is
 * never persisted.
 *
 * After this runs, you still need to add DNS records at your registrar for
 * the sending domain. Resend's dashboard shows the records and verifies them.
 * We don't automate DNS.
 */

import { pkgName } from "../lib/app.ts";
import { envSet } from "../lib/convex-env.ts";
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
  getDomain,
  listDomains,
  probeAccess,
  provisionSendingKey,
  provisionWebhook,
  verifyDomain,
  type ResendDomain,
} from "../lib/resend-api.ts";
import { recordStep } from "../lib/state.ts";

export type ResendOptions = {
  name?: string;
  from?: string;
};

export async function runResend(options: ResendOptions): Promise<number> {
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

  const access = await probeAccess(fullKey);
  if (access !== "full") {
    bad(`provided key has '${access}' access; need 'full'`);
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

    // Auto-poll for verification. User added DNS records and pressed Enter.
    // Resend's verification can take 5-60 min depending on the registrar.
    // Trigger Resend's re-check on each poll cycle (verifyDomain), then read.
    const all = await listDomains(fullKey);
    const pending = all.filter((d) => d.status !== "verified");
    if (pending.length === 0) {
      bad("no domains added yet in Resend. Add one in the dashboard, then re-run.");
      return 1;
    }
    const target = pending[pending.length - 1]; // most recently added
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
  const secret = await provisionWebhook(fullKey, endpoint);
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
  // Resend is wired, so the email-OTP / password-reset / change-email flows
  // can finish. Flip REQUIRE_EMAIL_VERIFICATION on so sign-up requires an
  // OTP and the client renders the email-features buttons.
  await envSet("REQUIRE_EMAIL_VERIFICATION", "true");
  ok("REQUIRE_EMAIL_VERIFICATION=true (sign-up now requires OTP)");

  await recordStep("resend", {
    domainId: domain.id,
    domainName: domain.name,
    keyName: name,
    fromAddress: fromAddr,
    webhookEndpoint: endpoint,
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
