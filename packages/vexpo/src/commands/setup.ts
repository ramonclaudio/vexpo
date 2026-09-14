import {
  envMap as convexEnvMap,
  isLoggedIn as convexIsLoggedIn,
  version as convexCliVersion,
} from "../lib/convex-env.ts";
import { ascStatus } from "../lib/eas-integrations.ts";
import {
  envList as easEnvList,
  resolveProjectId,
  version as easCliVersion,
  whoami as easWhoami,
} from "../lib/eas-project.ts";
import { readAll } from "../lib/env-local.ts";
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
import { detectPackageManager, dlx } from "../lib/pkg-manager.ts";
import { run, spawn } from "../lib/proc.ts";
import { clearAll, load as loadState, type SetupState, type StepName } from "../lib/state.ts";

import { runAccounts } from "./accounts.ts";
import { runAppleCredentials } from "./apple/credentials.ts";
import { runAscKey } from "./apple/asc-key.ts";
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
  noState?: boolean;
  lite?: boolean;
  isNew?: boolean;
  skipRebrand?: boolean;
};

type Scope = {
  accounts: boolean;
  rebrand: boolean;
  resend: boolean;
  eas: boolean;
  apple: boolean;
  reviewAccount: boolean;
};

function computeScope(o: SetupOptions): Scope {
  const lite = o.lite === true;
  return {
    accounts: o.isNew === true,
    rebrand: !lite && !o.skipRebrand,
    resend: !lite,
    eas: !lite,
    apple: !lite,
    reviewAccount: !lite,
  };
}

async function isXcodeInstalled(): Promise<boolean> {
  const proc = spawn(["xcode-select", "-p"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await proc.exited) === 0;
}

type Status = "missing" | "cached" | "live";

async function probeStep(
  options: SetupOptions,
  state: SetupState,
  step: StepName,
  liveCheck: () => Promise<boolean>,
): Promise<Status> {
  if (options.force) return "missing";
  if (!options.noState && state.steps[step]) return "cached";
  return (await liveCheck()) ? "live" : "missing";
}

const hasKeys = (env: Map<string, string>, keys: string[]): boolean =>
  keys.every((k) => env.has(k));

async function liveCheckEas(): Promise<boolean> {
  const projectId = await resolveProjectId();
  if (!projectId) return false;
  const eas = (await easEnvList("production")) ?? new Map<string, string>();
  return hasKeys(eas, [
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_CONVEX_SITE_URL",
    "EXPO_PUBLIC_SITE_URL",
  ]);
}

async function liveCheckAscLink(): Promise<boolean> {
  try {
    return (await ascStatus()).status === "connected";
  } catch {
    return false;
  }
}

const LOCAL_ENV_CORE = [
  "CONVEX_DEPLOYMENT",
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "EXPO_PUBLIC_SITE_URL",
  "EXPO_PUBLIC_APP_BUNDLE_ID",
];

type LocalEnvState = "ok" | "partial" | "missing";

function classifyLocalEnv(env: Map<string, string>): LocalEnvState {
  if (!hasKeys(env, LOCAL_ENV_CORE)) return "missing";
  return env.has("EXPO_PUBLIC_APPLE_TEAM_ID") ? "ok" : "partial";
}

async function stepPrerequisites(): Promise<void> {
  section("Prerequisites");
  if (process.platform !== "darwin") yep(`expected macOS, got ${process.platform}`);
  else ok("macOS");
  ok(process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`);
  if (await isXcodeInstalled()) ok("Xcode");
  else yep("Xcode not found (install it from the Mac App Store)");

  const [easV, convexV] = await Promise.all([easCliVersion(), convexCliVersion()]);
  if (easV) ok(`eas-cli ${easV}`);
  else nop("eas-cli not on PATH (npx fetches it when needed)");
  if (convexV) ok(`convex ${convexV}`);
  else nop("convex CLI not on PATH (npx fetches it when needed)");

  if (await convexIsLoggedIn()) ok("signed in to Convex");
  else yep("not signed in to Convex (`npx vexpo accounts` will prompt)");

  const who = await easWhoami();
  if (who) ok(`signed in to Expo as ${who}`);
  else yep("not signed in to Expo (run `npx eas-cli login` before `vexpo full`)");
}

const PROBE_LABELS: Array<[StepName, string]> = [
  ["rebrand", "Rebrand"],
  ["convex", "Convex / .env.local"],
  ["better-auth", "Better Auth"],
  ["resend", "Resend"],
  ["asc-key", "App Store Connect API key"],
  ["apple-services-id", "Sign in with Apple Services ID"],
  ["apple-sign-in", "Sign in with Apple JWT"],
  ["apple-credentials", "EAS iOS credentials"],
  ["apple-asc-link", "EAS to App Store Connect link"],
  ["eas", "EAS project and env"],
];

type Probe = { status: Map<StepName, Status>; install: boolean };

async function stepProbe(options: SetupOptions): Promise<Probe> {
  section("Probe");

  const installOk = await fileExists("node_modules/expo/package.json");
  const local = await readAll();
  const localEnv = classifyLocalEnv(local);
  const convexLive = localEnv !== "missing";
  const convex = (convexLive ? await convexEnvMap() : null) ?? new Map<string, string>();
  const state = await loadState();
  const probe = (step: StepName, live: () => Promise<boolean>) =>
    probeStep(options, state, step, live);

  const status = new Map<StepName, Status>([
    ["rebrand", await probe("rebrand", async () => false)],
    ["convex", convexLive ? "live" : "missing"],
    [
      "better-auth",
      await probe("better-auth", async () =>
        hasKeys(convex, ["SITE_URL", "BETTER_AUTH_SECRET", "APP_NAME"]),
      ),
    ],
    [
      "resend",
      await probe("resend", async () =>
        hasKeys(convex, [
          "RESEND_API_KEY",
          "EMAIL_FROM",
          "RESEND_WEBHOOK_SECRET",
          "RESEND_TEST_MODE",
        ]),
      ),
    ],
    ["asc-key", await probe("asc-key", async () => false)],
    [
      "apple-services-id",
      await probe("apple-services-id", async () => local.has("APPLE_SERVICES_ID")),
    ],
    [
      "apple-sign-in",
      await probe("apple-sign-in", async () =>
        hasKeys(convex, [
          "APPLE_CLIENT_ID",
          "APPLE_CLIENT_SECRET",
          "APPLE_TEAM_ID",
          "APPLE_KEY_ID",
        ]),
      ),
    ],
    ["apple-credentials", await probe("apple-credentials", async () => false)],
    ["apple-asc-link", await probe("apple-asc-link", liveCheckAscLink)],
    ["eas", await probe("eas", liveCheckEas)],
  ]);

  const mark = (s: Status): string =>
    s === "live"
      ? `${GREEN}ok${RESET}`
      : s === "cached"
        ? `${GREEN}ok${RESET} ${DIM}(cached)${RESET}`
        : `${RED}missing${RESET}`;
  const localEnvMark =
    localEnv === "ok"
      ? `${GREEN}ok${RESET}`
      : localEnv === "partial"
        ? `${YELLOW}partial (lite)${RESET}`
        : `${RED}missing${RESET}`;

  const w = 30;
  const row = (label: string, value: string) =>
    line(`  ${BOLD}${label.padEnd(w)}${RESET}  ${value}`);
  row("node_modules", installOk ? `${GREEN}ok${RESET}` : `${RED}missing${RESET}`);
  row(".env.local", localEnvMark);
  for (const [step, label] of PROBE_LABELS) row(label, mark(status.get(step)!));
  row("Review account", `${DIM}unknown (run \`npx vexpo review-account\`)${RESET}`);

  return { status, install: !installOk };
}

function isComplete(probe: Probe): boolean {
  if (probe.install) return false;
  return ![...probe.status.values()].includes("missing");
}

async function runInstall(): Promise<void> {
  const pm = await detectPackageManager();
  const cmd = [pm, "install"];
  const proc = spawn(cmd);
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed`);
  ok(cmd.join(" "));
}

function stepRunners(o: SetupOptions) {
  return {
    "vexpo accounts": () => runAccounts({ lite: o.lite }),
    "vexpo rebrand": () => runRebrand({}),
    "vexpo convex": () => runConvex({ fresh: o.fresh, local: o.local }),
    "vexpo better-auth": () => runBetterAuth({}),
    "vexpo resend": () => runResend({}),
    "vexpo apple asc-key": () => runAscKey(),
    "vexpo apple credentials": () => runAppleCredentials({}),
    "vexpo apple services-id": () => runServicesId({}),
    "vexpo apple jwt": () => runAppleJwt({}),
    "vexpo asc connect": () => runAscConnect({}),
    "vexpo eas": () => runEas(),
    "vexpo review-account": () => runReviewAccount({}),
  };
}

type StepCommand = keyof ReturnType<typeof stepRunners>;

async function runStep(options: SetupOptions, name: StepCommand): Promise<void> {
  const code = await stepRunners(options)[name]();
  if (code !== 0) throw new Error(`${name} exited with code ${code}`);
}

async function maybeRunStep(
  options: SetupOptions,
  name: StepCommand,
  prompt: string,
  defaultYes: boolean,
): Promise<void> {
  if (!process.stdin.isTTY) {
    nop(`no terminal, skipping ${name} (run it later)`);
    return;
  }
  if (!(await askYesNo(prompt, defaultYes))) {
    nop(`skipped ${name} (run it later)`);
    return;
  }
  await runStep(options, name);
}

type Phase = {
  step: StepName;
  command: StepCommand;
  inScope?: (scope: Scope) => boolean;
  skipNote?: string;
  needed?: (probe: Probe, options: SetupOptions) => boolean;
  prompt?: (status: Status | undefined) => { text: string; defaultYes: boolean };
};

const always = (text: string) => () => ({ text, defaultYes: true });
const missing =
  (step: StepName) =>
  (probe: Probe, o: SetupOptions): boolean =>
    o.force === true || probe.status.get(step) === "missing";

const PHASES: Phase[] = [
  {
    step: "accounts",
    command: "vexpo accounts",
    inScope: (s) => s.accounts,
    prompt: always("Walk through the Apple, Expo, Convex and Resend signups now?"),
  },
  {
    step: "rebrand",
    command: "vexpo rebrand",
    inScope: (s) => s.rebrand,
    needed: missing("rebrand"),
    prompt: always("Run the rebrand wizard to replace the template defaults?"),
  },
  {
    step: "convex",
    command: "vexpo convex",
    needed: missing("convex"),
  },
  {
    step: "better-auth",
    command: "vexpo better-auth",
    needed: missing("better-auth"),
  },
  {
    step: "resend",
    command: "vexpo resend",
    inScope: (s) => s.resend,
    needed: missing("resend"),
  },
  {
    step: "review-account",
    command: "vexpo review-account",
    inScope: (s) => s.reviewAccount,
    prompt: always("Create or reset the App Review demo account on Convex now?"),
  },
  {
    step: "eas",
    command: "vexpo eas",
    inScope: (s) => s.eas,
    skipNote: "EAS skipped in lite mode. `vexpo full` sets it up.",
    needed: missing("eas"),
  },
  {
    step: "asc-key",
    command: "vexpo apple asc-key",
    inScope: (s) => s.apple,
    skipNote:
      "Apple skipped in lite mode. `vexpo full` sets up Sign in with Apple and the credentials.",
    needed: missing("asc-key"),
    prompt: always("Validate the App Store Connect API key now?"),
  },
  {
    step: "apple-credentials",
    command: "vexpo apple credentials",
    inScope: (s) => s.apple,
    needed: missing("apple-credentials"),
    prompt: always("Set up the iOS signing credentials on EAS now?"),
  },
  {
    step: "apple-asc-link",
    command: "vexpo asc connect",
    inScope: (s) => s.apple,
    needed: missing("apple-asc-link"),
    prompt: always("Link the EAS project to its App Store Connect app now?"),
  },
  {
    step: "apple-services-id",
    command: "vexpo apple services-id",
    inScope: (s) => s.apple,
    needed: missing("apple-services-id"),
    prompt: always("Set up the Sign in with Apple Services ID now?"),
  },
  {
    step: "apple-sign-in",
    command: "vexpo apple jwt",
    inScope: (s) => s.apple,
    prompt: (status) => {
      const healthy = status === "live" || status === "cached";
      return {
        text: healthy
          ? "Sign in with Apple is set up. Re-sign the JWT now?"
          : "Sign the Sign in with Apple JWT now?",
        defaultYes: !healthy,
      };
    },
  },
];

async function runPhases(options: SetupOptions, probe: Probe, scope: Scope): Promise<void> {
  for (const phase of PHASES) {
    if (phase.inScope && !phase.inScope(scope)) {
      if (phase.skipNote) nop(phase.skipNote);
      continue;
    }
    if (phase.needed && !phase.needed(probe, options)) {
      nop(`${phase.command} already done`);
      continue;
    }
    const ask = phase.prompt?.(probe.status.get(phase.step));
    if (ask) await maybeRunStep(options, phase.command, ask.text, ask.defaultYes);
    else await runStep(options, phase.command);
  }
}

async function stepExpoDoctor(): Promise<void> {
  section("expo-doctor");
  const { code, stdout, stderr } = await run([dlx(), "expo-doctor"]);
  if (stdout.trim()) process.stderr.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
  if (code === 0) ok("no issues");
  else yep(`expo-doctor found issues (exit ${code}), see above`);
}

function printSummary(elapsedMs: number): void {
  line();
  ok(`setup complete in ${(elapsedMs / 1000).toFixed(1)}s`);
  note(`${BOLD}npx vexpo doctor${RESET} checks every credential against its service`);
  line(`\n  next: ${BOLD}npx convex dev${RESET} ${DIM}then${RESET} ${BOLD}npm run ios${RESET}\n`);
}

function printShipNextSteps(): void {
  line();
  section("Next: ship to TestFlight");
  line(
    `  ${BOLD}CONVEX_DEPLOY_KEY= npx convex deploy${RESET}   ${DIM}push the backend to the prod deployment${RESET}`,
  );
  line(
    `  ${BOLD}npm run eas:tf${RESET}                        ${DIM}build on EAS and submit to App Store Connect${RESET}`,
  );
  line(`  ${DIM}The first Beta App Review takes a day or two.${RESET}`);
}

function reportNothingToDo(): void {
  line();
  ok("everything is set up, nothing to do");
  note("`vexpo full --force` re-runs every step");
  note("`vexpo full --fresh` starts over with a new Convex deployment");
  note("a subcommand like `vexpo resend` re-runs one step");
}

export async function runSetup(given: SetupOptions): Promise<number> {
  const startedAt = performance.now();
  // A new deployment starts empty, so every step runs again.
  const options = given.fresh ? { ...given, force: true } : given;
  try {
    if (options.fresh) await clearAll();

    await stepPrerequisites();
    const probe = await stepProbe(options);

    if (isComplete(probe) && !options.force) {
      reportNothingToDo();
      return 0;
    }

    if (probe.install) {
      section("Install");
      await runInstall();
    }

    await runPhases(options, probe, computeScope(options));

    await stepExpoDoctor();
    printSummary(performance.now() - startedAt);

    if (!options.lite) printShipNextSteps();
    return 0;
  } catch (err) {
    line();
    bad(errText(err));
    return 1;
  }
}
