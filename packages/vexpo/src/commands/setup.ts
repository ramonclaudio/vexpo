import { access } from "node:fs/promises";

import {
  envMap as convexEnvMap,
  isLoggedIn as convexIsLoggedIn,
  version as convexCliVersion,
} from "../lib/convex-env.ts";
import {
  envList as easEnvList,
  resolveProjectId,
  version as easCliVersion,
} from "../lib/eas-env.ts";
import { ENV_FILE, readAll } from "../lib/env-local.ts";
import { fileExists } from "../lib/fs.ts";
import {
  BOLD,
  DIM,
  GREEN,
  RED,
  RESET,
  YELLOW,
  askYesNo,
  bad,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../lib/output.ts";
import {
  currentRuntime,
  currentRuntimeVersion,
  detectPackageManager,
  installCmdFor,
} from "../lib/pkg-manager.ts";
import { run, spawn } from "../lib/proc.ts";
import {
  appendAudit,
  checkConcurrentRun,
  clearAll,
  isStepFresh,
  load as loadState,
  recordStep,
  type StepName,
} from "../lib/state.ts";

import { runAccounts } from "./accounts.ts";
import { runAppleCredentials } from "./apple/credentials.ts";
import { runAscKey } from "./apple/asc-key.ts";
import { runEasRotationSecrets } from "./apple/eas-rotation-secrets.ts";
import { runAppleJwt } from "./apple/jwt.ts";
import { runServicesId } from "./apple/services-id.ts";
import { runAscConnect } from "./asc.ts";
import { runBetterAuth } from "./better-auth.ts";
import { runConvex } from "./convex.ts";
import { runEas } from "./eas.ts";
import { runRebrand } from "./rebrand.ts";
import { runResend } from "./resend.ts";
import { runReviewAccount } from "./review-account.ts";

export type SetupOptions = {
  local?: boolean;
  fresh?: boolean;
  force?: boolean;
  dryRun?: boolean;
  plan?: boolean;
  noState?: boolean;
  lite?: boolean;
  /**
   * An Apple Developer Program membership is always required for TestFlight
   * because Apple has no API to create one. `--new` includes a pause and
   * `helpAndWait` if the user isn't enrolled.
   */
  isNew?: boolean;
  skipRebrand?: boolean;
};

type EffectiveScope = {
  accounts: boolean;
  rebrand: boolean;
  resend: boolean;
  eas: boolean;
  apple: boolean;
  reviewAccount: boolean;
};

export function computeScope(o: SetupOptions): EffectiveScope {
  const lite = o.lite === true;
  const isNew = o.isNew === true;
  return {
    accounts: isNew,
    rebrand: !lite && !o.skipRebrand,
    resend: !lite,
    eas: !lite,
    apple: !lite,
    reviewAccount: !lite,
  };
}

let options: SetupOptions = {};

async function isXcodeInstalled(): Promise<boolean> {
  const proc = spawn(["xcode-select", "-p"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await proc.exited) === 0;
}

async function trashPaths(paths: string[]): Promise<void> {
  const existing: string[] = [];
  for (const p of paths) {
    try {
      await access(p);
      existing.push(p);
    } catch {}
  }
  if (existing.length === 0) return;
  const proc = spawn(["trash", ...existing], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}

async function wipeMetroCaches(tmpdir: string): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  let entries: string[] = [];
  try {
    entries = await readdir(tmpdir);
  } catch {
    return;
  }
  const matchers = [/^metro-/, /^haste-map-/, /^react-/, /^node-compile-cache$/];
  const targets = entries
    .filter((e) => matchers.some((m) => m.test(e)))
    .map((e) => join(tmpdir, e));
  await trashPaths(targets);
}

async function nodeModulesPresent(): Promise<boolean> {
  return (
    (await fileExists("node_modules/.package-lock.json")) ||
    (await fileExists("node_modules/.bin/expo")) ||
    (await fileExists("node_modules/expo/package.json"))
  );
}

const STEP_TTL_HOURS: Record<StepName, number> = {
  accounts: 24,
  rebrand: Infinity,
  convex: 12,
  "better-auth": 1,
  resend: 1,
  "asc-key": 24,
  "apple-services-id": 24,
  "apple-sign-in": 24,
  // EAS credentials don't drift; once configured, they stay until you rotate.
  "apple-credentials": Infinity,
  // ASC project link via `eas integrations:asc:connect`. Live-checked through
  // `eas integrations:asc:status` so cache TTL is short. Drift would mean
  // someone disconnected via the EAS dashboard.
  "apple-asc-link": 24,
  // No cache for the rotation secrets phase. EAS env state is the source of
  // truth, and the secrets list query takes ~1s.
  "apple-eas-rotation-secrets": 0,
  // eas: 0, no cache, always probe live via `eas env:list`. eas-cli is the
  // source of truth here and our wrapper is too thin to be worth caching.
  eas: 0,
  "review-account": Infinity,
};

type ProbeRow = {
  step: StepName;
  label: string;
  status: "missing" | "cached" | "live" | "skipped";
  detail?: string;
};

async function shouldRun(step: StepName, liveCheck: () => Promise<boolean>): Promise<ProbeRow> {
  if (options.force) return { step, label: step, status: "missing" };
  if (options.noState) {
    const live = await liveCheck();
    return { step, label: step, status: live ? "live" : "missing" };
  }
  const state = await loadState();
  if (isStepFresh(state, step, STEP_TTL_HOURS[step])) {
    return { step, label: step, status: "cached" };
  }
  const live = await liveCheck();
  if (live && !options.dryRun && !options.plan && !options.noState) {
    // Gated on !dryRun + !plan + !noState because those modes are explicitly
    // read-only previews; mutating state.json from a preview would be a surprise.
    await recordStep(step, { source: "live-check" });
  }
  return { step, label: step, status: live ? "live" : "missing" };
}

async function liveCheckBetterAuth(env?: Map<string, string>): Promise<boolean> {
  const e = env ?? (await convexEnvMap());
  return ["SITE_URL", "BETTER_AUTH_SECRET", "APP_NAME"].every((k) => e.has(k));
}

async function liveCheckResend(env?: Map<string, string>): Promise<boolean> {
  const e = env ?? (await convexEnvMap());
  return ["RESEND_API_KEY", "EMAIL_FROM", "RESEND_WEBHOOK_SECRET", "RESEND_TEST_MODE"].every((k) =>
    e.has(k),
  );
}

async function liveCheckApple(env?: Map<string, string>): Promise<boolean> {
  const e = env ?? (await convexEnvMap());
  return ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET", "APPLE_TEAM_ID", "APPLE_KEY_ID"].every((k) =>
    e.has(k),
  );
}

async function liveCheckEas(): Promise<boolean> {
  const projectId = await resolveProjectId();
  if (!projectId) return false;
  const eas = await easEnvList("production").catch(() => new Map<string, string>());
  return ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CONVEX_SITE_URL", "EXPO_PUBLIC_SITE_URL"].every(
    (k) => eas.has(k),
  );
}

async function liveCheckAscLink(): Promise<boolean> {
  try {
    const { ascStatus } = await import("../lib/eas-integrations.ts");
    const status = await ascStatus();
    return status.status === "connected";
  } catch {
    return false;
  }
}

async function liveCheckRotationSecrets(): Promise<boolean> {
  const projectId = await resolveProjectId();
  if (!projectId) return false;
  const eas = await easEnvList("production").catch(() => new Map<string, string>());
  return [
    "APPLE_P8_PRIVATE_KEY",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_SERVICES_ID",
    "CONVEX_DEPLOY_KEY",
  ].every((k) => eas.has(k));
}

// The lite core is everything `vexpo lite` writes to .env.local. Team id is
// legitimately absent after lite (convex.ts treats it as optional for lite), so
// it lives outside the core and gets its own state.
const LOCAL_ENV_LITE_CORE = [
  "CONVEX_DEPLOYMENT",
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "EXPO_PUBLIC_SITE_URL",
  "EXPO_PUBLIC_APP_BUNDLE_ID",
] as const;

const LOCAL_ENV_TEAM_ID = "EXPO_PUBLIC_APPLE_TEAM_ID";

export type LocalEnvState = "ok" | "partial" | "missing";

// "ok" = full core + team id. "partial" = lite core present, team id missing
// (a healthy lite deployment). "missing" = lite core incomplete.
export function classifyLocalEnv(env: Map<string, string>): LocalEnvState {
  if (!LOCAL_ENV_LITE_CORE.every((k) => env.has(k))) return "missing";
  return env.has(LOCAL_ENV_TEAM_ID) ? "ok" : "partial";
}

async function liveCheckLocalEnv(): Promise<LocalEnvState> {
  return classifyLocalEnv(await readAll());
}

async function stepPrerequisites(): Promise<void> {
  section("Prerequisites");
  if (process.platform !== "darwin") yep(`expected darwin, got ${process.platform}`);
  else ok("macOS detected");
  ok(`${currentRuntime()} ${currentRuntimeVersion()}`);
  if (await isXcodeInstalled()) ok("xcode-select reports an Xcode toolchain");
  else yep("Xcode not detected (install from Mac App Store)");

  const [easV, convexV] = await Promise.all([easCliVersion(), convexCliVersion()]);
  if (easV) ok(`eas-cli ${easV}`);
  else nop("eas-cli not on PATH (npx will fetch on demand)");
  if (convexV) ok(`convex ${convexV}`);
  else nop("convex CLI not on PATH (npx will fetch on demand)");

  if (await convexIsLoggedIn()) ok("Convex auth detected");
  else yep("not signed in to Convex (`npx vexpo accounts` will prompt)");
}

async function stepProbe(): Promise<{
  rows: Map<string, ProbeRow>;
  needs: Map<string, boolean>;
  install: boolean;
  localEnv: LocalEnvState;
}> {
  section("Probe");

  const installOk = await nodeModulesPresent();
  const localEnvState = await liveCheckLocalEnv();
  // The convex step is live once the lite core is present; it doesn't depend on
  // the team id (which lite skips). "partial" still means a connected deployment.
  const convexLive = localEnvState !== "missing";
  const convex = convexLive ? await convexEnvMap() : new Map<string, string>();

  const rows = new Map<string, ProbeRow>();
  rows.set("accounts", await shouldRun("accounts", async () => true));
  rows.set("rebrand", await shouldRun("rebrand", async () => false));
  rows.set("convex", {
    step: "convex",
    label: "convex",
    status: convexLive ? "live" : "missing",
  });
  rows.set("better-auth", await shouldRun("better-auth", () => liveCheckBetterAuth(convex)));
  rows.set("resend", await shouldRun("resend", () => liveCheckResend(convex)));
  rows.set("asc-key", await shouldRun("asc-key", async () => false));
  rows.set(
    "apple-services-id",
    await shouldRun("apple-services-id", async () => !!(await readAll()).get("APPLE_SERVICES_ID")),
  );
  rows.set("apple-sign-in", await shouldRun("apple-sign-in", () => liveCheckApple(convex)));
  rows.set("apple-credentials", await shouldRun("apple-credentials", async () => false));
  rows.set("apple-asc-link", await shouldRun("apple-asc-link", liveCheckAscLink));
  rows.set(
    "apple-eas-rotation-secrets",
    await shouldRun("apple-eas-rotation-secrets", liveCheckRotationSecrets),
  );
  rows.set("eas", await shouldRun("eas", liveCheckEas));

  const mark = (status: ProbeRow["status"]) =>
    status === "live"
      ? `${GREEN}ok${RESET}`
      : status === "cached"
        ? `${GREEN}ok${RESET} ${DIM}(cached)${RESET}`
        : status === "skipped"
          ? `${DIM}skipped${RESET}`
          : `${RED}missing${RESET}`;

  const w = 22;
  line(
    `  ${BOLD}${"node_modules".padEnd(w)}${RESET}  ${installOk ? `${GREEN}ok${RESET}` : `${RED}missing${RESET}`}`,
  );
  const localEnvMark =
    localEnvState === "ok"
      ? `${GREEN}ok${RESET}`
      : localEnvState === "partial"
        ? `${YELLOW}partial (lite)${RESET}`
        : `${RED}missing${RESET}`;
  line(`  ${BOLD}${".env.local".padEnd(w)}${RESET}  ${localEnvMark}`);
  for (const [key, row] of rows) {
    const label =
      key === "convex"
        ? "Convex / .env.local"
        : key === "better-auth"
          ? "Better Auth"
          : key === "resend"
            ? "Resend"
            : key === "asc-key"
              ? "ASC API key"
              : key === "apple-services-id"
                ? "Sign In Services ID"
                : key === "apple-sign-in"
                  ? "Sign In JWT"
                  : key === "apple-credentials"
                    ? "EAS iOS credentials"
                    : key === "apple-asc-link"
                      ? "EAS ↔ ASC link"
                      : key === "apple-eas-rotation-secrets"
                        ? "EAS rotation secrets"
                        : key === "eas"
                          ? "EAS project + env"
                          : key === "rebrand"
                            ? "Rebrand"
                            : key === "accounts"
                              ? "Accounts"
                              : key;
    line(`  ${BOLD}${label.padEnd(w)}${RESET}  ${mark(row.status)}`);
  }
  line(
    `  ${BOLD}${"Review account".padEnd(w)}${RESET}  ${DIM}unknown (run \`npx vexpo review-account\` to seed)${RESET}`,
  );

  const needs = new Map<string, boolean>();
  for (const [k, row] of rows) needs.set(k, row.status === "missing");

  return { rows, needs, install: !installOk, localEnv: localEnvState };
}

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

async function printDryRunPlan(probe: {
  rows: Map<string, ProbeRow>;
  needs: Map<string, boolean>;
  install: boolean;
}): Promise<void> {
  const scope = computeScope(options);
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
    const desc = await describePhase(step, probe);
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

function printJourneyPlan(lite: boolean): void {
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

export function isComplete(result: { needs: Map<string, boolean>; install: boolean }): boolean {
  if (result.install) return false;
  // Every phase that `vexpo full` invokes in default scope (i.e. excluding
  // `accounts` and `review-account`, which are opt-in / standalone) must appear
  // here, otherwise a step missing from the cache will exit early through the
  // "everything is configured" gate.
  for (const required of [
    "rebrand",
    "convex",
    "better-auth",
    "resend",
    "asc-key",
    "apple-credentials",
    "apple-asc-link",
    "apple-services-id",
    "apple-sign-in",
    "apple-eas-rotation-secrets",
    "eas",
  ] as const) {
    if (result.needs.get(required)) return false;
  }
  return true;
}

async function stepCleanup(fresh: boolean): Promise<void> {
  section("Clean install");
  const tmpdir = process.env.TMPDIR ?? "/tmp";
  const targets = [
    "node_modules",
    "package-lock.json",
    "bun.lock",
    "ios",
    ".expo",
    "dist",
    "convex/_generated",
    "tsconfig.tsbuildinfo",
    ...(fresh ? [ENV_FILE] : []),
  ];
  await trashPaths(targets);
  await wipeMetroCaches(tmpdir);
  ok(
    fresh
      ? `trashed node_modules, lockfile, ios/, build artifacts, Metro caches, and ${ENV_FILE}`
      : "trashed node_modules, lockfile, ios/, build artifacts, and Metro caches",
  );
  await runInstall();
}

async function runInstall(): Promise<void> {
  const pm = await detectPackageManager();
  const cmd = installCmdFor(pm).split(" ");
  const proc = spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed`);
  ok(cmd.join(" "));
}

async function stepInstallOnly(): Promise<void> {
  section("Install");
  await runInstall();
}

const completed: StepName[] = [];
const skipped: StepName[] = [];
let failedStep: StepName | null = null;

type StepRunner = () => Promise<number>;

const STEP_RUNNERS: Record<string, StepRunner> = {
  "vexpo accounts": () => runAccounts({ lite: options.lite }),
  "vexpo rebrand": () => runRebrand({}),
  "vexpo convex": () => runConvex({ fresh: options.fresh, local: options.local }),
  "vexpo better-auth": () => runBetterAuth({}),
  "vexpo resend": () => runResend({}),
  "vexpo apple asc-key": () => runAscKey({}),
  "vexpo apple credentials": () => runAppleCredentials({}),
  "vexpo apple services-id": () => runServicesId({}),
  "vexpo apple jwt": () => runAppleJwt({}),
  "vexpo apple eas-rotation-secrets": () => runEasRotationSecrets({}),
  "vexpo asc connect": () => runAscConnect({}),
  "vexpo eas": async () =>
    runEas({ withProd: (await fileExists(".env.prod")) || (await fileExists(".env.production")) }),
  "vexpo review-account": () => runReviewAccount({}),
};

async function runStep(name: string, state?: StepName): Promise<void> {
  const runner = STEP_RUNNERS[name];
  if (!runner) throw new Error(`unknown setup step: ${name}`);
  try {
    const code = await runner();
    if (code !== 0) throw new Error(`${name} exited with code ${code}`);
  } catch (err) {
    if (state) failedStep = state;
    throw err;
  }
  if (state) completed.push(state);
}

async function maybeRunStep(
  name: string,
  prompt: string,
  state?: StepName,
  defaultYes = true,
): Promise<void> {
  if (!process.stdin.isTTY) {
    nop(`non-TTY: skipping ${name} (run \`${name}\` later)`);
    if (state) skipped.push(state);
    return;
  }
  if (!(await askYesNo(prompt, defaultYes))) {
    nop(`skipped ${name} (run \`${name}\` later)`);
    if (state) skipped.push(state);
    return;
  }
  await runStep(name, state);
}

function printShipNextSteps(): void {
  line();
  section("Next: ship to TestFlight");
  line(`  Run this when you're ready:`);
  line();
  line(
    `  ${BOLD}npx eas-cli build -p ios --profile production --auto-submit-with-profile testflight${RESET}`,
  );
  line();
  line(
    `  ${DIM}~30 min build on EAS Build, then automatic ASC submission + Apple Beta App Review (~24-48h on first submit).${RESET}`,
  );
}

async function stepExpoDoctor(): Promise<void> {
  section("expo-doctor");
  const { dlx } = await import("../lib/pkg-manager.ts");
  const { code, stdout, stderr } = await run([dlx(), "expo-doctor"]);
  if (stdout.trim()) process.stderr.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
  if (code === 0) ok("no issues");
  else yep(`expo-doctor reported issues (exit ${code}); review above`);
}

async function printSummary(useLocal: boolean, elapsedMs: number): Promise<void> {
  section("Summary");
  const [localEnv, convexEnv] = await Promise.all([readAll(), convexEnvMap()]);
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

export async function runSetup(opts: SetupOptions): Promise<number> {
  options = opts;
  failedStep = null;
  completed.length = 0;
  skipped.length = 0;
  const startedAtPerf = performance.now();
  const startedAtIso = new Date().toISOString();
  let failureMessage: string | null = null;

  try {
    if (options.fresh) {
      await clearAll();
    }

    // Warn but don't block on a concurrent run: the state file's atomic rename
    // and per-step idempotency handle the race.
    if (!options.dryRun && !options.plan && !options.noState) {
      const existing = await loadState();
      const concurrent = checkConcurrentRun(existing);
      if (concurrent.active && concurrent.otherPid !== undefined) {
        yep(
          `another vexpo run (pid ${concurrent.otherPid}) touched .setup-state.json recently; if you're not running in another terminal, ignore this`,
        );
      }
    }

    await stepPrerequisites();
    const probe = await stepProbe();

    if (options.plan) {
      printJourneyPlan(options.lite === true);
      return 0;
    }

    if (options.dryRun) {
      await printDryRunPlan(probe);
      return 0;
    }

    if (isComplete(probe) && !options.force && !options.fresh) {
      line();
      ok("everything is configured, nothing to do");
      note("`vexpo full --force` to re-run every step idempotently");
      note("`vexpo full --fresh` to wipe state and reprovision Convex from scratch");
      note("`vexpo full --dry-run` to preview what each phase would do");
      note("standalone subcommands (e.g. `vexpo resend`) re-run a single step");
      return 0;
    }

    if (options.fresh) {
      await stepCleanup(true);
    } else if (probe.install) {
      await stepInstallOnly();
    }

    const scope = computeScope(options);

    if (scope.accounts) {
      const status = probe.rows.get("accounts")?.status;
      if (options.force || status === "missing") {
        await maybeRunStep(
          "vexpo accounts",
          "Walk through Apple/Expo/Convex/Resend signups now?",
          "accounts",
        );
      } else {
        nop("vexpo accounts cached");
      }
    } else {
      skipped.push("accounts");
    }

    if (scope.rebrand) {
      const status = probe.rows.get("rebrand")?.status;
      if (options.force || status === "missing") {
        await maybeRunStep(
          "vexpo rebrand",
          "Run the rebrand wizard to replace template defaults?",
          "rebrand",
        );
      } else {
        nop("vexpo rebrand cached");
      }
    } else {
      skipped.push("rebrand");
    }

    if (options.fresh || options.force || probe.needs.get("convex")) {
      await runStep("vexpo convex", "convex");
    } else {
      nop("vexpo convex already complete");
    }

    if (options.force || probe.needs.get("better-auth")) {
      await runStep("vexpo better-auth", "better-auth");
    } else {
      nop("vexpo better-auth already complete");
    }

    if (scope.resend) {
      if (options.force || probe.needs.get("resend")) {
        await runStep("vexpo resend", "resend");
      } else {
        nop("vexpo resend already complete");
      }
    } else {
      skipped.push("resend");
    }

    if (scope.reviewAccount) {
      await maybeRunStep(
        "vexpo review-account",
        "Seed (or re-seed) the App Review demo account on Convex now?",
        "review-account",
      );
    } else {
      skipped.push("review-account");
    }

    if (scope.eas) {
      if (options.force || probe.needs.get("eas")) {
        await runStep("vexpo eas", "eas");
      } else {
        nop("vexpo eas already complete");
      }
    } else {
      section("EAS (skipped. lite mode)");
      nop("re-run without `--lite` to provision EAS");
      skipped.push("eas");
    }

    if (scope.apple) {
      if (options.force || probe.needs.get("asc-key")) {
        await maybeRunStep(
          "vexpo apple asc-key",
          "Validate or upload App Store Connect API key now?",
          "asc-key",
        );
      } else {
        nop("vexpo apple asc-key cached");
      }

      if (options.force || probe.needs.get("apple-credentials")) {
        await maybeRunStep(
          "vexpo apple credentials",
          "Configure EAS iOS credentials (dist cert + profile + push key) now?",
          "apple-credentials",
        );
      } else {
        nop("vexpo apple credentials cached");
      }

      if (options.force || probe.needs.get("apple-asc-link")) {
        await maybeRunStep(
          "vexpo asc connect",
          "Link the EAS project to its ASC app now?",
          "apple-asc-link",
        );
      } else {
        nop("vexpo asc connect cached");
      }

      if (options.force || probe.needs.get("apple-services-id")) {
        await maybeRunStep(
          "vexpo apple services-id",
          "Provision Sign In with Apple Services ID via ASC API now?",
          "apple-services-id",
        );
      } else {
        nop("vexpo apple services-id cached");
      }
      const status = probe.rows.get("apple-sign-in")?.status;
      // A healthy configured JWT shouldn't default to a rotation. Render [y/N]
      // for the rotate prompt; keep [Y/n] for the fresh sign prompt.
      const healthy = status === "live" || status === "cached";
      const prompt = healthy
        ? "Apple Sign In is configured, rotate the JWT now?"
        : "Sign the Apple Sign In JWT now?";
      await maybeRunStep("vexpo apple jwt", prompt, "apple-sign-in", !healthy);

      if (options.force || probe.needs.get("apple-eas-rotation-secrets")) {
        await maybeRunStep(
          "vexpo apple eas-rotation-secrets",
          "Push the 5 EAS production secrets the JWT rotation cron needs?",
          "apple-eas-rotation-secrets",
        );
      } else {
        nop("EAS rotation secrets already set");
      }
    } else {
      section("Apple (skipped. lite mode)");
      nop(
        "re-run without `--lite` to provision Apple Sign In, ASC key, services id, EAS credentials",
      );
      skipped.push(
        "apple-sign-in",
        "apple-services-id",
        "apple-credentials",
        "apple-asc-link",
        "asc-key",
        "apple-eas-rotation-secrets",
      );
    }

    await stepExpoDoctor();
    await printSummary(!!options.local, performance.now() - startedAtPerf);

    if (!options.lite && !options.dryRun) {
      printShipNextSteps();
    }
  } catch (err) {
    line();
    if (err instanceof Error) {
      bad(err.message);
      failureMessage = err.message;
    } else {
      bad(String(err));
      failureMessage = String(err);
    }
    return 1;
  } finally {
    // Skip the audit on read-only modes: mutating .setup-state.json from a
    // preview would break CI workflows that rely on the cache staying stable
    // across dry-run validations.
    const skipAudit = options.dryRun === true || options.plan === true || options.noState === true;
    if (!skipAudit) {
      try {
        await appendAudit({
          invokedAt: startedAtIso,
          args: process.argv.slice(2),
          pid: process.pid,
          bunVersion: currentRuntimeVersion(),
          cwd: process.cwd(),
          completed,
          skipped,
          ...(failureMessage
            ? { failed: { step: failedStep ?? "convex", message: failureMessage } }
            : {}),
        });
      } catch {
        // never let audit logging hide a real error
      }
    }
  }
  return 0;
}
