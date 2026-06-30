import { envMap as convexEnvMap } from "../lib/convex-env.ts";
import { envList as easEnvList, resolveProjectId } from "../lib/eas-project.ts";
import { readAll } from "../lib/env-local.ts";
import { BOLD, DIM, GREEN, RESET, YELLOW, line, note, section } from "../lib/output.ts";
import { load as loadState, type StepName } from "../lib/state.ts";

import type { EffectiveScope, ProbeRow, SetupOptions } from "./setup.ts";

type PhaseDescription = {
  step: StepName;
  label: string;
  action: string;
  details: string[];
  irreversible?: boolean;
};

async function describePhase(
  step: StepName,
  probe: { rows: Map<string, ProbeRow>; needs: Map<string, boolean> },
  options: SetupOptions,
): Promise<PhaseDescription> {
  const status = probe.rows.get(step)?.status;
  const willRun = options.force || probe.needs.get(step) === true || status === "missing";
  const cached = status === "cached" || status === "live";

  switch (step) {
    case "accounts":
      return {
        step,
        label: "setup:accounts",
        action: cached && !options.force ? "skip (cached)" : "run",
        details: [
          "confirm Apple Developer enrollment ($99/yr). manual y/n",
          "confirm domain + DNS access. manual y/n",
          "check Convex/Expo CLI auth, offer to run their login commands",
          "ask for Resend full-access key (or use RESEND_FULL_ACCESS_KEY env)",
        ],
      };
    case "rebrand":
      return {
        step,
        label: "setup:rebrand",
        action: willRun ? "run (template defaults detected)" : "skip (already rebranded)",
        details: [
          "prompt for: app name, bundle id, owner name, review email",
          "derive: package name, scheme, marketing/support/privacy URLs, copyright",
          "rewrite app.config.ts, app.json, package.json, store.config.json",
          "back up originals to .rebrand-backup/<timestamp>/",
        ],
        irreversible: false,
      };
    case "convex": {
      const localOk = probe.rows.get("convex")?.status === "live";
      return {
        step,
        label: "setup:convex",
        action: options.fresh
          ? "provision NEW deployment (--fresh)"
          : localOk
            ? "skip (existing deployment connected)"
            : "provision or connect deployment",
        details: options.fresh
          ? [
              "wipe CONVEX_DEPLOYMENT + EXPO_PUBLIC_CONVEX_* from .env.local",
              "run `npx convex dev --configure new --once`",
              "write CONVEX_DEPLOYMENT, EXPO_PUBLIC_CONVEX_URL, EXPO_PUBLIC_CONVEX_SITE_URL to .env.local",
              "prompt for bundle id + Apple Team id (or use app.config.ts defaults)",
            ]
          : [
              "read CONVEX_DEPLOYMENT from .env.local",
              "run `npx convex dev --once` to verify connection + regenerate codegen",
            ],
      };
    }
    case "better-auth":
      return {
        step,
        label: "setup:better-auth",
        action: cached && !options.force ? "skip (cached)" : "run",
        details: [
          "generate 32-byte base64 BETTER_AUTH_SECRET via node:crypto",
          "set BETTER_AUTH_SECRET, SITE_URL, APP_NAME on Convex dev env",
        ],
      };
    case "resend":
      return {
        step,
        label: "setup:resend",
        action: cached && !options.force ? "skip (cached)" : "run",
        details: [
          "use RESEND_FULL_ACCESS_KEY env (or prompt for it)",
          "verify the key against /api-keys",
          "list verified Resend domains, pick one (or auto-pick if single)",
          "delete any prior key/webhook with our name (idempotent)",
          "create scoped sending key (project-name) + webhook → <convex-site>/resend-webhook",
          "set RESEND_API_KEY, RESEND_WEBHOOK_SECRET, EMAIL_FROM, RESEND_TEST_MODE=false on Convex",
        ],
      };
    case "review-account":
      return {
        step,
        label: "setup:review-account",
        action: "run (interactive y/n)",
        details: [
          "read apple.review.demoUsername/demoPassword from store.config.json",
          "create user via Better Auth signup",
          "flip emailVerified=true via the adapter so Apple's reviewer can sign in",
        ],
      };
    case "eas":
      return {
        step,
        label: "setup:eas",
        action: "run (delegates to eas-cli, no cache)",
        details: [
          "delegate to `eas init` (creates/reuses projectId in app.json)",
          "delegate to `eas env:push --path .env.local --environment development --force`",
          "with --with-prod, also push .env.prod to production + preview",
          "after this, run `eas credentials -p ios` separately for cert + profile + push key",
        ],
      };
    case "asc-key":
      return {
        step,
        label: "setup:asc-key",
        action:
          cached && !options.force ? "skip (cached, validated <24h ago)" : "run (interactive y/n)",
        details: [
          "validates an ASC API key against ASC's GET /v1/apps before EAS uses it",
          "we do NOT upload to EAS. that's `eas credentials`. We only validate + cache",
          "cache (issuer, keyId, p8 path) in state.json so `npx vexpo apple services-id` can reuse",
          "fast-fail: catches a bad key in <1s instead of waiting for an EAS build to fail",
        ],
      };
    case "apple-services-id":
      return {
        step,
        label: "setup:apple:services-id",
        action: cached && !options.force ? "skip (cached)" : "run (manual web UI break)",
        details: [
          "Apple removed the API path that created Services IDs (POST rejects platform: SERVICES)",
          "look up the Services ID via GET; if missing, walk you through manual creation in the developer portal",
          "attach APPLE_ID_AUTH capability to the App's primary Bundle ID via ASC API",
          "write APPLE_SERVICES_ID to .env.local",
        ],
      };
    case "apple-sign-in":
      return {
        step,
        label: "setup:apple",
        action: cached && !options.force ? "skip (cached, JWT valid)" : "run (interactive y/n)",
        details: [
          "ours, not eas-cli's: SIWA needs an ES256 client_secret JWT, signed locally",
          "prompt for Sign In with Apple .p8 path (cached in state if available)",
          "sign ES256 JWT with 180-day expiry (Apple's max, re-sign every <150d)",
          "push APPLE_CLIENT_ID/TEAM_ID/KEY_ID/CLIENT_SECRET to Convex env (Better Auth reads these)",
        ],
      };
    case "apple-credentials":
      return {
        step,
        label: "setup:apple:credentials",
        action: cached && !options.force ? "skip (cached)" : "run (eas-cli interactive wizard)",
        details: [
          "wraps `eas credentials -p ios`. eas-cli's wizard has no non-interactive path",
          "passes cached ASC creds via EXPO_ASC_API_KEY_* env vars (skips Apple Developer login)",
          "EAS auto-generates dist cert + provisioning profile + push key via ASC API",
          "after this, every `eas build` + `eas submit` works without further prompts",
        ],
      };
    case "apple-asc-link":
      return {
        step,
        label: "setup:asc:connect",
        action: cached && !options.force ? "skip (already connected)" : "run (eas-cli interactive)",
        details: [
          "spawns `eas integrations:asc:connect --bundle-id <bundle>`",
          "pre-sets EXPO_ASC_API_KEY_* env vars from cached asc-key state",
          "wizard prompts once when no key is uploaded yet (Create new / Use existing)",
          "after this, `eas submit` skips ASC app discovery",
        ],
      };
    case "apple-eas-rotation-secrets":
      return {
        step,
        label: "setup:apple:eas-rotation-secrets",
        action: cached && !options.force ? "skip (all 5 set)" : "run (mints CONVEX_DEPLOY_KEY)",
        details: [
          "push the 5 EAS production secrets the JWT rotation cron needs",
          "APPLE_P8_PRIVATE_KEY (.p8 path; EAS reads + base64-encodes it)",
          "APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICES_ID (from apple-sign-in state)",
          "CONVEX_DEPLOY_KEY (minted via the Convex Platform API; paste fallback if offline)",
        ],
      };
  }
}

export async function printDryRunPlan(
  probe: {
    rows: Map<string, ProbeRow>;
    needs: Map<string, boolean>;
    install: boolean;
  },
  options: SetupOptions,
  scope: EffectiveScope,
): Promise<void> {
  const phases: StepName[] = [
    ...((scope.accounts ? ["accounts"] : []) as StepName[]),
    ...((scope.rebrand ? ["rebrand"] : []) as StepName[]),
    "convex",
    "better-auth",
    ...((scope.resend ? ["resend"] : []) as StepName[]),
    ...((scope.reviewAccount ? ["review-account"] : []) as StepName[]),
    ...((scope.eas ? ["eas"] : []) as StepName[]),
    ...((scope.apple
      ? [
          "asc-key",
          "apple-credentials",
          "apple-asc-link",
          "apple-services-id",
          "apple-sign-in",
          "apple-eas-rotation-secrets",
        ]
      : []) as StepName[]),
  ];

  section("Dry run plan");
  if (options.fresh)
    note(
      `${YELLOW}--fresh${RESET}: would wipe .setup-state.json + node_modules + ios/ + package-lock.json + build artifacts before reprovisioning`,
    );
  if (options.force) note(`${YELLOW}--force${RESET}: would re-run every step regardless of cache`);
  if (probe.install) note(`would run install (no node_modules)`);

  let runCount = 0;
  let skipCount = 0;
  for (const step of phases) {
    const desc = await describePhase(step, probe, options);
    const isSkip = desc.action.startsWith("skip");
    if (isSkip) skipCount += 1;
    else runCount += 1;
    const prefix = isSkip ? `${DIM}-${RESET}` : `${GREEN}→${RESET}`;
    line(`\n  ${prefix} ${BOLD}${desc.label}${RESET}  ${DIM}${desc.action}${RESET}`);
    for (const d of desc.details) note(`    ${d}`);
  }
  line();
  section("Summary");
  line(
    `  ${GREEN}${runCount}${RESET} phase${runCount === 1 ? "" : "s"} would run, ${DIM}${skipCount}${RESET} skipped`,
  );
  line();
  note(`drop ${DIM}--dry-run${RESET} to actually do it`);
  note(`single-phase: ${DIM}npx vexpo <phase>${RESET} (e.g. ${DIM}npx vexpo resend${RESET})`);
}

type JourneyEntry = {
  label: string;
  cost: string;
  description: string;
  url?: string;
};

const JOURNEY: { async: JourneyEntry[]; sync: JourneyEntry[]; auto: JourneyEntry[] } = {
  async: [
    {
      label: "Apple Developer enrollment",
      cost: "24-48h",
      description:
        "$99/yr. Identity verification, payment, signed agreements. Org accounts also need a D-U-N-S number.",
      url: "https://developer.apple.com/programs/enroll",
    },
    {
      label: "Domain DNS propagation",
      cost: "5-60 min",
      description:
        "After you add SPF + DKIM + MX records at your registrar, Resend re-checks them. Some registrars propagate in seconds, others take an hour. The CLI auto-polls Resend's verification status.",
    },
  ],
  sync: [
    {
      label: "App Store Connect API key",
      cost: "5 min",
      description:
        "Generate, save the .p8 (one-time download), note Issuer ID + Key ID. Bootstraps every other ASC API call.",
      url: "https://appstoreconnect.apple.com/access/integrations/api",
    },
    {
      label: "Sign In with Apple key",
      cost: "5 min",
      description:
        "Different .p8 from the ASC key. Used to sign client_secret JWTs. One key per Apple Team is enough.",
      url: "https://developer.apple.com/account/resources/authkeys/list",
    },
    {
      label: "Sign In with Apple Services ID",
      cost: "5 min",
      description:
        "Apple removed the API path that creates these. CLI walks you through the web UI step inline.",
      url: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
    },
    {
      label: "Resend domain + DNS records",
      cost: "10 min",
      description:
        "Add domain in Resend, drop 5 records at your registrar (SPF + DKIM + MX-send + return-path CNAME + tracking), watch verify.",
      url: "https://resend.com/domains",
    },
    {
      label: "Convex production deploy key",
      cost: "auto",
      description:
        "For the JWT rotation cron and the deploy_convex step in deploy-production.yml. Minted automatically via the Convex Platform API; paste only as an offline fallback.",
      url: "https://dashboard.convex.dev",
    },
    {
      label: "EAS iOS credentials wizard",
      cost: "5 min",
      description:
        "eas-cli wizard creates dist cert + provisioning profile + push key on EAS. Cached ASC API key is passed through env vars so the Apple Developer login prompt is skipped.",
    },
  ],
  auto: [
    {
      label: "Convex deployment provisioning",
      cost: "auto",
      description: "Spins up dev (and prod, if --fresh) deployment, writes .env.local.",
    },
    {
      label: "BETTER_AUTH_SECRET generation",
      cost: "auto",
      description: "32-byte base64 secret, pushed to Convex env.",
    },
    {
      label: "Resend API key + webhook",
      cost: "auto",
      description:
        "Scoped sending key, webhook on /resend-webhook signed with a fresh secret. Subscribes to bounced/complained/suppressed/failed events.",
    },
    {
      label: "ASC API key validation",
      cost: "auto",
      description: "Signs an ES256 JWT, hits GET /v1/apps. Caches creds for downstream commands.",
    },
    {
      label: "EAS init + env mirror",
      cost: "auto",
      description:
        "eas init (creates project), eas env:push from .env.local + .env.prod across dev/preview/prod.",
    },
    {
      label: "SIWA Services ID capability",
      cost: "auto",
      description:
        "Detects existing Services ID, attaches APPLE_ID_AUTH capability to the App ID via ASC API.",
    },
    {
      label: "SIWA client_secret JWT signing",
      cost: "auto",
      description:
        "Local ES256 signing with 180-day expiry. Pushes APPLE_CLIENT_ID/TEAM_ID/KEY_ID/CLIENT_SECRET to Convex env.",
    },
    {
      label: "EAS rotation secrets",
      cost: "auto",
      description:
        "Pushes the 5 EAS production secrets the JWT rotation cron needs (4 from .env.local + state, plus CONVEX_DEPLOY_KEY minted via the Platform API).",
    },
  ],
};

export function printJourneyPlan(lite: boolean): void {
  if (lite) {
    section("Setup journey (lite)");
    line(
      `  ${DIM}Lite mode provisions only what the iOS Simulator needs. No Apple Developer account, no domain, no Resend, no EAS account. ~60 seconds from start to \`npm run ios\`.${RESET}`,
    );
    line();
    line(`  ${BOLD}${GREEN}Auto${RESET} ${DIM}(CLI does it, no input needed)${RESET}`);
    for (const e of JOURNEY.auto.filter((j) => LITE_AUTO_LABELS.has(j.label))) {
      line(`    ${BOLD}${e.label.padEnd(36)}${RESET} ${DIM}${e.cost.padEnd(12)}${RESET}`);
      note(`      ${e.description}`);
    }
    line();
    section("Next");
    note(
      `run ${BOLD}vexpo lite${RESET} to start (add ${BOLD}--new${RESET} for a Convex signup walkthrough).`,
    );
    note(
      `re-run ${BOLD}vexpo full${RESET} later when you're ready to ship: that provisions Resend, Apple Sign In, EAS, and the rebrand wizard.`,
    );
    line();
    return;
  }

  section("Setup journey");
  line(
    `  ${DIM}Setup is multi-session. Some gates need a human (Apple enrollment, DNS), some need clicking (web UI), some are pure automation. Total wallclock dominated by Apple enrollment when starting from scratch (~2 days). Active keyboard time: ~30 minutes.${RESET}`,
  );
  line();

  line(`  ${BOLD}${YELLOW}Async waits${RESET} ${DIM}(wallclock, schedule accordingly)${RESET}`);
  for (const e of JOURNEY.async) {
    line(`    ${BOLD}${e.label.padEnd(36)}${RESET} ${DIM}${e.cost.padEnd(12)}${RESET}`);
    note(`      ${e.description}`);
    if (e.url) note(`      ${BOLD}${e.url}${RESET}`);
  }
  line();

  line(`  ${BOLD}${YELLOW}Sync clicks${RESET} ${DIM}(web UI work, all on you)${RESET}`);
  for (const e of JOURNEY.sync) {
    line(`    ${BOLD}${e.label.padEnd(36)}${RESET} ${DIM}${e.cost.padEnd(12)}${RESET}`);
    note(`      ${e.description}`);
    if (e.url) note(`      ${BOLD}${e.url}${RESET}`);
  }
  line();

  line(`  ${BOLD}${GREEN}Auto${RESET} ${DIM}(CLI does it, no input needed)${RESET}`);
  for (const e of JOURNEY.auto) {
    line(`    ${BOLD}${e.label.padEnd(36)}${RESET} ${DIM}${e.cost.padEnd(12)}${RESET}`);
    note(`      ${e.description}`);
  }
  line();

  section("Next");
  note(
    `run ${BOLD}vexpo full${RESET} to start. State caches in .setup-state.json so re-runs resume.`,
  );
  note(
    `${BOLD}vexpo full --dry-run${RESET} previews each phase against current state (does it need to run, does it skip).`,
  );
  line();
}

// Auto-tier phases that lite mode also runs. Keep the labels in sync with
// JOURNEY.auto entries below.
const LITE_AUTO_LABELS = new Set<string>([
  "Convex deployment provisioning",
  "BETTER_AUTH_SECRET generation",
]);

export async function printSummary(useLocal: boolean, elapsedMs: number): Promise<void> {
  section("Summary");
  const [localEnv, convexEnvOrNull] = await Promise.all([readAll(), convexEnvMap()]);
  const convexEnv = convexEnvOrNull ?? new Map<string, string>();
  const easEnv = await easEnvList("production").catch(() => new Map<string, string>());
  const projectId = await resolveProjectId();
  const state = await loadState();

  const localKeys = [
    "CONVEX_DEPLOYMENT",
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_CONVEX_SITE_URL",
    "EXPO_PUBLIC_SITE_URL",
    "EXPO_PUBLIC_APP_BUNDLE_ID",
    "EXPO_PUBLIC_APPLE_TEAM_ID",
    "APPLE_SERVICES_ID",
  ];
  const convexKeys = [
    "SITE_URL",
    "BETTER_AUTH_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "APP_NAME",
    "RESEND_TEST_MODE",
    "RESEND_WEBHOOK_SECRET",
    "APP_BUNDLE_ID",
    "APPLE_CLIENT_ID",
    "APPLE_CLIENT_SECRET",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
  ];
  const easKeys = [
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_CONVEX_SITE_URL",
    "EXPO_PUBLIC_SITE_URL",
    "EXPO_PUBLIC_APP_BUNDLE_ID",
    "EXPO_PUBLIC_APPLE_TEAM_ID",
  ];
  const stateKeys: StepName[] = [
    "accounts",
    "rebrand",
    "convex",
    "better-auth",
    "resend",
    "review-account",
    "asc-key",
    "apple-credentials",
    "apple-asc-link",
    "apple-services-id",
    "apple-sign-in",
    "apple-eas-rotation-secrets",
    "eas",
  ];

  const width = Math.max(
    ...localKeys.map((k) => k.length),
    ...convexKeys.map((k) => k.length),
    ...easKeys.map((k) => k.length),
    ...stateKeys.map((k) => k.length),
  );
  const mark = (set: boolean) => (set ? `${GREEN}set${RESET}` : `${DIM}unset${RESET}`);
  const row = (key: string, set: boolean) => line(`    ${key.padEnd(width)}  ${mark(set)}`);

  line(`  ${BOLD}.env.local${RESET}`);
  for (const k of localKeys) row(k, localEnv.has(k));

  line(`\n  ${BOLD}Convex env${RESET}`);
  for (const k of convexKeys) row(k, convexEnv.has(k));

  if (projectId) {
    line(`\n  ${BOLD}EAS project${RESET}  ${projectId}`);
    if (easEnv.size > 0) {
      line(`  ${BOLD}EAS env (production)${RESET}`);
      for (const k of easKeys) row(k, easEnv.has(k));
    }
  }

  line(`\n  ${BOLD}.setup-state.json${RESET}`);
  for (const k of stateKeys) {
    const rec = state.steps[k];
    line(
      `    ${k.padEnd(width)}  ${rec ? `${GREEN}ok${RESET} ${DIM}(${rec.completedAt.slice(0, 10)})${RESET}` : `${DIM}-${RESET}`}`,
    );
  }

  line(`\n  ${GREEN}ok${RESET}   setup complete in ${(elapsedMs / 1000).toFixed(2)}s`);
  line(
    `\n  next: ${BOLD}${useLocal ? "npx convex dev" : "npm run convex:dev"}${RESET} ${DIM}then${RESET} ${BOLD}npm run ios${RESET}\n`,
  );
}
