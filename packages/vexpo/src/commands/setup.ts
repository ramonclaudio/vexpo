import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  envMap as convexEnvMap,
  isLoggedIn as convexIsLoggedIn,
  version as convexCliVersion,
} from "../lib/convex-env.ts";
import {
  envList as easEnvList,
  resolveProjectId,
  version as easCliVersion,
  whoami as easWhoami,
} from "../lib/eas-project.ts";
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
  errText,
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
  touchVerifyAt,
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
import { printDryRunPlan, printJourneyPlan, printSummary } from "./setup-plan.ts";

export type SetupOptions = {
  local?: boolean;
  fresh?: boolean;
  force?: boolean;
  dryRun?: boolean;
  plan?: boolean;
  noState?: boolean;
  lite?: boolean;
  isNew?: boolean;
  skipRebrand?: boolean;
};

export type EffectiveScope = {
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

type RunContext = {
  options: SetupOptions;
  completed: StepName[];
  skipped: StepName[];
  failedStep: StepName | null;
};

async function isXcodeInstalled(): Promise<boolean> {
  const proc = spawn(["xcode-select", "-p"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await proc.exited) === 0;
}

async function removePaths(paths: string[]): Promise<void> {
  for (const p of paths) {
    await rm(p, { recursive: true, force: true });
  }
}

async function wipeMetroCaches(tmpdir: string): Promise<void> {
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
  await removePaths(targets);
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
  "apple-credentials": Infinity,
  "apple-asc-link": 24,
  "apple-eas-rotation-secrets": 0,
  eas: 0,
  "review-account": Infinity,
};

export type ProbeRow = {
  step: StepName;
  label: string;
  status: "missing" | "cached" | "live" | "skipped";
  detail?: string;
};

async function shouldRun(
  ctx: RunContext,
  step: StepName,
  liveCheck: () => Promise<boolean>,
): Promise<ProbeRow> {
  const { options } = ctx;
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
    await touchVerifyAt(step);
  }
  return { step, label: step, status: live ? "live" : "missing" };
}

async function liveCheckBetterAuth(env?: Map<string, string>): Promise<boolean> {
  const e = env ?? (await convexEnvMap()) ?? new Map<string, string>();
  return ["SITE_URL", "BETTER_AUTH_SECRET", "APP_NAME"].every((k) => e.has(k));
}

async function liveCheckResend(env?: Map<string, string>): Promise<boolean> {
  const e = env ?? (await convexEnvMap()) ?? new Map<string, string>();
  return ["RESEND_API_KEY", "EMAIL_FROM", "RESEND_WEBHOOK_SECRET", "RESEND_TEST_MODE"].every((k) =>
    e.has(k),
  );
}

async function liveCheckApple(env?: Map<string, string>): Promise<boolean> {
  const e = env ?? (await convexEnvMap()) ?? new Map<string, string>();
  return ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET", "APPLE_TEAM_ID", "APPLE_KEY_ID"].every((k) =>
    e.has(k),
  );
}

async function liveCheckEas(): Promise<boolean> {
  const projectId = await resolveProjectId();
  if (!projectId) return false;
  const eas = (await easEnvList("production")) ?? new Map<string, string>();
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
  const eas = (await easEnvList("production")) ?? new Map<string, string>();
  return [
    "APPLE_P8_PRIVATE_KEY",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_SERVICES_ID",
    "CONVEX_DEPLOY_KEY",
  ].every((k) => eas.has(k));
}

const LOCAL_ENV_LITE_CORE = [
  "CONVEX_DEPLOYMENT",
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "EXPO_PUBLIC_SITE_URL",
  "EXPO_PUBLIC_APP_BUNDLE_ID",
] as const;

const LOCAL_ENV_TEAM_ID = "EXPO_PUBLIC_APPLE_TEAM_ID";

export type LocalEnvState = "ok" | "partial" | "missing";

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

  const who = await easWhoami();
  if (who) ok(`Expo auth: signed in as ${who}`);
  else yep("not signed in to Expo (run `npx eas-cli login` before `vexpo full`)");
}

const STEP_LABELS: Record<string, string> = {
  convex: "Convex / .env.local",
  "better-auth": "Better Auth",
  resend: "Resend",
  "asc-key": "ASC API key",
  "apple-services-id": "Sign In Services ID",
  "apple-sign-in": "Sign In JWT",
  "apple-credentials": "EAS iOS credentials",
  "apple-asc-link": "EAS ↔ ASC link",
  "apple-eas-rotation-secrets": "EAS rotation secrets",
  eas: "EAS project + env",
  rebrand: "Rebrand",
  accounts: "Accounts",
};

async function stepProbe(ctx: RunContext): Promise<{
  rows: Map<string, ProbeRow>;
  needs: Map<string, boolean>;
  install: boolean;
  localEnv: LocalEnvState;
}> {
  section("Probe");

  const installOk = await nodeModulesPresent();
  const localEnvState = await liveCheckLocalEnv();
  const convexLive = localEnvState !== "missing";
  const convex = (convexLive ? await convexEnvMap() : null) ?? new Map<string, string>();

  const rows = new Map<string, ProbeRow>();
  rows.set("accounts", await shouldRun(ctx, "accounts", async () => true));
  rows.set("rebrand", await shouldRun(ctx, "rebrand", async () => false));
  rows.set("convex", {
    step: "convex",
    label: "convex",
    status: convexLive ? "live" : "missing",
  });
  rows.set("better-auth", await shouldRun(ctx, "better-auth", () => liveCheckBetterAuth(convex)));
  rows.set("resend", await shouldRun(ctx, "resend", () => liveCheckResend(convex)));
  rows.set("asc-key", await shouldRun(ctx, "asc-key", async () => false));
  rows.set(
    "apple-services-id",
    await shouldRun(
      ctx,
      "apple-services-id",
      async () => !!(await readAll()).get("APPLE_SERVICES_ID"),
    ),
  );
  rows.set("apple-sign-in", await shouldRun(ctx, "apple-sign-in", () => liveCheckApple(convex)));
  rows.set("apple-credentials", await shouldRun(ctx, "apple-credentials", async () => false));
  rows.set("apple-asc-link", await shouldRun(ctx, "apple-asc-link", liveCheckAscLink));
  rows.set(
    "apple-eas-rotation-secrets",
    await shouldRun(ctx, "apple-eas-rotation-secrets", liveCheckRotationSecrets),
  );
  rows.set("eas", await shouldRun(ctx, "eas", liveCheckEas));

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
    const label = STEP_LABELS[key] ?? key;
    line(`  ${BOLD}${label.padEnd(w)}${RESET}  ${mark(row.status)}`);
  }
  line(
    `  ${BOLD}${"Review account".padEnd(w)}${RESET}  ${DIM}unknown (run \`npx vexpo review-account\` to seed)${RESET}`,
  );

  const needs = new Map<string, boolean>();
  for (const [k, row] of rows) needs.set(k, row.status === "missing");

  return { rows, needs, install: !installOk, localEnv: localEnvState };
}

export function isComplete(result: { needs: Map<string, boolean>; install: boolean }): boolean {
  if (result.install) return false;
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
  await removePaths(targets);
  await wipeMetroCaches(tmpdir);
  ok(
    fresh
      ? `removed node_modules, lockfile, ios/, build artifacts, Metro caches, and ${ENV_FILE}`
      : "removed node_modules, lockfile, ios/, build artifacts, and Metro caches",
  );
  await runInstall();
}

async function runInstall(): Promise<void> {
  const pm = await detectPackageManager();
  const cmd = installCmdFor(pm).split(" ");
  const proc = spawn(cmd);
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed`);
  ok(cmd.join(" "));
}

async function stepInstallOnly(): Promise<void> {
  section("Install");
  await runInstall();
}

function stepRunners(o: SetupOptions) {
  return {
    "vexpo accounts": () => runAccounts({ lite: o.lite }),
    "vexpo rebrand": () => runRebrand({}),
    "vexpo convex": () => runConvex({ fresh: o.fresh, local: o.local }),
    "vexpo better-auth": () => runBetterAuth({}),
    "vexpo resend": () => runResend({}),
    "vexpo apple asc-key": () => runAscKey({}),
    "vexpo apple credentials": () => runAppleCredentials({}),
    "vexpo apple services-id": () => runServicesId({}),
    "vexpo apple jwt": () => runAppleJwt({}),
    "vexpo apple eas-rotation-secrets": () => runEasRotationSecrets({}),
    "vexpo asc connect": () => runAscConnect({}),
    "vexpo eas": async () =>
      runEas({
        withProd: (await fileExists(".env.prod")) || (await fileExists(".env.production")),
      }),
    "vexpo review-account": () => runReviewAccount({}),
  };
}

async function runStep(ctx: RunContext, name: StepCommand, state?: StepName): Promise<void> {
  const runner = stepRunners(ctx.options)[name];
  try {
    const code = await runner();
    if (code !== 0) throw new Error(`${name} exited with code ${code}`);
  } catch (err) {
    if (state) ctx.failedStep = state;
    throw err;
  }
  if (state) ctx.completed.push(state);
}

async function maybeRunStep(
  ctx: RunContext,
  name: StepCommand,
  prompt: string,
  state?: StepName,
  defaultYes = true,
): Promise<void> {
  if (!process.stdin.isTTY) {
    nop(`non-TTY: skipping ${name} (run \`${name}\` later)`);
    if (state) ctx.skipped.push(state);
    return;
  }
  if (!(await askYesNo(prompt, defaultYes))) {
    nop(`skipped ${name} (run \`${name}\` later)`);
    if (state) ctx.skipped.push(state);
    return;
  }
  await runStep(ctx, name, state);
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

type Probe = { rows: Map<string, ProbeRow>; needs: Map<string, boolean>; install: boolean };

type StepCommand = keyof ReturnType<typeof stepRunners>;

type Phase = {
  step: StepName;
  command: StepCommand;
  inScope?: (scope: EffectiveScope) => boolean;
  offScopeNotice?: () => void;
  prompt?: (status: ProbeRow["status"] | undefined) => { text: string; defaultYes: boolean };
} & (
  | { needed: (probe: Probe, options: SetupOptions) => boolean; cached: string }
  | { needed?: never; cached?: never }
);

const always = (text: string) => () => ({ text, defaultYes: true });
const missingOrForced =
  (step: StepName) =>
  (probe: Probe, o: SetupOptions): boolean =>
    o.force === true || probe.rows.get(step)?.status === "missing";
const needsWork =
  (step: StepName) =>
  (probe: Probe, o: SetupOptions): boolean =>
    o.force === true || probe.needs.get(step) === true;

const PHASES: Phase[] = [
  {
    step: "accounts",
    command: "vexpo accounts",
    inScope: (s) => s.accounts,
    needed: missingOrForced("accounts"),
    cached: "vexpo accounts cached",
    prompt: always("Walk through Apple/Expo/Convex/Resend signups now?"),
  },
  {
    step: "rebrand",
    command: "vexpo rebrand",
    inScope: (s) => s.rebrand,
    needed: missingOrForced("rebrand"),
    cached: "vexpo rebrand cached",
    prompt: always("Run the rebrand wizard to replace template defaults?"),
  },
  {
    step: "convex",
    command: "vexpo convex",
    needed: (probe, o) => o.fresh === true || needsWork("convex")(probe, o),
    cached: "vexpo convex already complete",
  },
  {
    step: "better-auth",
    command: "vexpo better-auth",
    needed: needsWork("better-auth"),
    cached: "vexpo better-auth already complete",
  },
  {
    step: "resend",
    command: "vexpo resend",
    inScope: (s) => s.resend,
    needed: needsWork("resend"),
    cached: "vexpo resend already complete",
  },
  {
    step: "review-account",
    command: "vexpo review-account",
    inScope: (s) => s.reviewAccount,
    prompt: always("Seed (or re-seed) the App Review demo account on Convex now?"),
  },
  {
    step: "eas",
    command: "vexpo eas",
    inScope: (s) => s.eas,
    offScopeNotice: () => {
      section("EAS (skipped. lite mode)");
      nop("re-run without `--lite` to provision EAS");
    },
    needed: needsWork("eas"),
    cached: "vexpo eas already complete",
  },
  {
    step: "asc-key",
    command: "vexpo apple asc-key",
    inScope: (s) => s.apple,
    offScopeNotice: () => {
      section("Apple (skipped. lite mode)");
      nop(
        "re-run without `--lite` to provision Apple Sign In, ASC key, services id, EAS credentials",
      );
    },
    needed: needsWork("asc-key"),
    cached: "vexpo apple asc-key cached",
    prompt: always("Validate or upload App Store Connect API key now?"),
  },
  {
    step: "apple-credentials",
    command: "vexpo apple credentials",
    inScope: (s) => s.apple,
    needed: needsWork("apple-credentials"),
    cached: "vexpo apple credentials cached",
    prompt: always("Configure EAS iOS credentials (dist cert + profile + push key) now?"),
  },
  {
    step: "apple-asc-link",
    command: "vexpo asc connect",
    inScope: (s) => s.apple,
    needed: needsWork("apple-asc-link"),
    cached: "vexpo asc connect cached",
    prompt: always("Link the EAS project to its ASC app now?"),
  },
  {
    step: "apple-services-id",
    command: "vexpo apple services-id",
    inScope: (s) => s.apple,
    needed: needsWork("apple-services-id"),
    cached: "vexpo apple services-id cached",
    prompt: always("Provision Sign In with Apple Services ID via ASC API now?"),
  },
  {
    step: "apple-sign-in",
    command: "vexpo apple jwt",
    inScope: (s) => s.apple,
    prompt: (status) => {
      const healthy = status === "live" || status === "cached";
      return {
        text: healthy
          ? "Apple Sign In is configured, rotate the JWT now?"
          : "Sign the Apple Sign In JWT now?",
        defaultYes: !healthy,
      };
    },
  },
  {
    step: "apple-eas-rotation-secrets",
    command: "vexpo apple eas-rotation-secrets",
    inScope: (s) => s.apple,
    needed: needsWork("apple-eas-rotation-secrets"),
    cached: "EAS rotation secrets already set",
    prompt: always("Push the 5 EAS production secrets the JWT rotation cron needs?"),
  },
];

async function runPhases(ctx: RunContext, probe: Probe, scope: EffectiveScope): Promise<void> {
  for (const phase of PHASES) {
    if (phase.inScope && !phase.inScope(scope)) {
      phase.offScopeNotice?.();
      ctx.skipped.push(phase.step);
      continue;
    }
    if (phase.needed && !phase.needed(probe, ctx.options)) {
      nop(phase.cached);
      continue;
    }
    const ask = phase.prompt?.(probe.rows.get(phase.step)?.status);
    if (ask) await maybeRunStep(ctx, phase.command, ask.text, phase.step, ask.defaultYes);
    else await runStep(ctx, phase.command, phase.step);
  }
}

async function warnConcurrentRun(options: SetupOptions): Promise<void> {
  if (options.dryRun || options.plan || options.noState) return;
  const concurrent = checkConcurrentRun(await loadState());
  if (!concurrent.active || concurrent.otherPid === undefined) return;
  yep(
    `another vexpo run (pid ${concurrent.otherPid}) touched .setup-state.json recently; if you're not running in another terminal, ignore this`,
  );
}

async function writeAudit(
  ctx: RunContext,
  invokedAt: string,
  failureMessage: string | null,
): Promise<void> {
  const o = ctx.options;
  if (o.dryRun === true || o.plan === true || o.noState === true) return;
  try {
    await appendAudit({
      invokedAt,
      args: process.argv.slice(2),
      pid: process.pid,
      bunVersion: currentRuntimeVersion(),
      cwd: process.cwd(),
      completed: ctx.completed,
      skipped: ctx.skipped,
      ...(failureMessage
        ? { failed: { step: ctx.failedStep ?? "unknown", message: failureMessage } }
        : {}),
    });
  } catch {}
}

function reportNothingToDo(): void {
  line();
  ok("everything is configured, nothing to do");
  note("`vexpo full --force` to re-run every step idempotently");
  note("`vexpo full --fresh` to wipe state and reprovision Convex from scratch");
  note("`vexpo full --dry-run` to preview what each phase would do");
  note("standalone subcommands (e.g. `vexpo resend`) re-run a single step");
}

/** Returns an exit code when the run is a preview or already complete, else null. */
async function exitBeforeRunning(probe: Probe, options: SetupOptions): Promise<number | null> {
  if (options.plan) {
    printJourneyPlan(options.lite === true);
    return 0;
  }
  if (options.dryRun) {
    await printDryRunPlan(probe, options, computeScope(options));
    return 0;
  }
  if (isComplete(probe) && !options.force && !options.fresh) {
    reportNothingToDo();
    return 0;
  }
  return null;
}

export async function runSetup(opts: SetupOptions): Promise<number> {
  const ctx: RunContext = { options: opts, completed: [], skipped: [], failedStep: null };
  const { options } = ctx;
  const startedAtPerf = performance.now();
  const startedAtIso = new Date().toISOString();
  let failureMessage: string | null = null;

  try {
    if (options.fresh) await clearAll();
    await warnConcurrentRun(options);

    await stepPrerequisites();
    const probe = await stepProbe(ctx);

    const early = await exitBeforeRunning(probe, options);
    if (early !== null) return early;

    if (options.fresh) await stepCleanup(true);
    else if (probe.install) await stepInstallOnly();

    await runPhases(ctx, probe, computeScope(options));

    await stepExpoDoctor();
    await printSummary(!!options.local, performance.now() - startedAtPerf);

    if (!options.lite) printShipNextSteps();
  } catch (err) {
    line();
    const message = errText(err);
    failureMessage = message;
    bad(message);
    return 1;
  } finally {
    await writeAudit(ctx, startedAtIso, failureMessage);
  }
  return 0;
}
