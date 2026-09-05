import { appleTeamIdFallback, bundleIdFallback, pkgName, scheme } from "../lib/app.ts";
import { envSet as convexEnvSet, recordedOrDerivedDeployment } from "../lib/convex-env.ts";
import { checkToken } from "../lib/convex-management.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { convexProjectLink } from "../lib/eas-integrations.ts";
import { ensureLine, readAll, removeLines } from "../lib/env-local.ts";
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
import { dlx } from "../lib/pkg-manager.ts";
import { spawn } from "../lib/proc.ts";
import { recordStep } from "../lib/state.ts";

export type ConvexOptions = {
  fresh?: boolean;
  local?: boolean;
  name?: string;
  eas?: boolean;
  region?: string;
};

const BUNDLE_ID_RE = /^[A-Za-z0-9.-]+$/;
const TEAM_ID_RE = /^[A-Z0-9]{10}$/;

export type TeamIdInput = { kind: "skip" } | { kind: "invalid" | "ok"; value: string };

export function resolveTeamIdInput(raw: string, fromConfig: string | null): TeamIdInput {
  const value = raw.trim().toUpperCase() || (fromConfig ?? "");
  if (!value) return { kind: "skip" };
  if (!TEAM_ID_RE.test(value)) return { kind: "invalid", value };
  return { kind: "ok", value };
}

export function planConvexDev(
  options: { local?: boolean; eas?: boolean; region?: string },
  needsProvisioning: boolean,
  projectName: string,
  team?: string,
): { selectLocalFirst: boolean; connectArgs?: string[]; devArgs: string[] } {
  const devArgs = ["convex", "dev", "--once", "--tail-logs", "disable"];
  if (needsProvisioning && options.eas) {
    const connectArgs = ["integrations:convex:connect", "--project-name", projectName];
    if (team) connectArgs.push("--team-name", team);
    if (options.region) connectArgs.push("--region", options.region);
    return { selectLocalFirst: false, connectArgs, devArgs };
  }
  if (needsProvisioning) {
    devArgs.push("--configure", "new", "--project", projectName);
    if (team) devArgs.push("--team", team);
    devArgs.push("--dev-deployment", options.local ? "local" : "cloud");
  }
  return { selectLocalFirst: !!options.local && !options.eas && !needsProvisioning, devArgs };
}

export function convexUrls(slug: string, local: boolean): { url: string; siteUrl: string } {
  if (local) return { url: "http://127.0.0.1:3210", siteUrl: "http://127.0.0.1:3211" };
  return { url: `https://${slug}.convex.cloud`, siteUrl: `https://${slug}.convex.site` };
}

async function existingDeployment(
  options: ConvexOptions,
  localEnv: Map<string, string>,
): Promise<string | undefined> {
  if (options.fresh) {
    await removeLines([
      "CONVEX_DEPLOYMENT",
      "EXPO_PUBLIC_CONVEX_URL",
      "EXPO_PUBLIC_CONVEX_SITE_URL",
    ]);
    return undefined;
  }
  return recordedOrDerivedDeployment(localEnv, async (ref) => {
    await ensureLine("CONVEX_DEPLOYMENT", ref);
    ok(`derived CONVEX_DEPLOYMENT=${ref} from CONVEX_DEPLOY_KEY`);
  });
}

function explainDevFailure(needsProvisioning: boolean, team: string | undefined): void {
  if (!needsProvisioning) return;
  if (!team && !process.stdin.isTTY) {
    note("provisioning a new Convex project picks a team interactively, which");
    note("can't prompt here. Set CONVEX_TEAM=<slug> (Convex dashboard > team");
    note("settings) or run `vexpo lite` in an interactive terminal.");
    return;
  }
  note('if the error above says the team "is managed by oauth:...", the');
  note("account creates projects only through the EAS integration. Rerun as");
  note("`npx vexpo convex --eas`, which spawns it and then picks up from there.");
}

async function noProjectLinkedYet(): Promise<boolean> {
  const linked = await convexProjectLink();
  if (!linked) return true;
  bad(`EAS already has a Convex project linked to this app: ${linked.name}`);
  note("`eas integrations:convex:connect` provisions a second one, it has no way");
  note("to reuse an existing Convex project. Put that project's deploy key in");
  note("`.env.local` as CONVEX_DEPLOY_KEY and rerun without `--eas`.");
  if (linked.dashboard) note(`deploy keys: ${linked.dashboard}/settings`);
  note("to relink on purpose, run `npx eas-cli integrations:convex:project:delete`");
  note("first. That drops the EAS link only, nothing on Convex is destroyed.");
  return false;
}

async function connectThroughEas(
  options: ConvexOptions,
  connectArgs: string[] | undefined,
  projectName: string,
): Promise<boolean> {
  if (options.eas && options.local) {
    bad("--eas and --local are mutually exclusive");
    note("the EAS integration provisions a cloud deployment. Drop one of the two.");
    return false;
  }
  if (!connectArgs) return true;
  if (!(await noProjectLinkedYet())) return false;
  ok(`connecting Convex through EAS for '${projectName}'`);
  note("spawning `eas integrations:convex:connect`. It prompts for a region, and");
  note("for a team name only when it has to create the team connection.");
  line();
  const code = await easSpawn(connectArgs);
  line();
  if (code !== 0) {
    bad(`eas integrations:convex:connect exited with code ${code}`);
    note("it needs the app linked to EAS first. Run `npx eas-cli init`, then retry.");
    return false;
  }
  note("EAS wrote CONVEX_DEPLOY_KEY to .env.local. That key wins over `--prod` and");
  note("`--deployment-name` on every convex command, so `npm run convex:logs:prod`");
  note("reads dev until you point the CLI at another env file. See .env.example.");
  note("it also wrote this dev URL to EXPO_PUBLIC_CONVEX_URL on EAS for all three");
  note("environments, production included. `vexpo env push` corrects production");
  note("and preview once a prod deployment exists.");
  return await recordKeyDeployment();
}

async function recordKeyDeployment(): Promise<boolean> {
  const env = await readAll();
  const ref = await recordedOrDerivedDeployment(env, async (derived) => {
    await ensureLine("CONVEX_DEPLOYMENT", derived);
    ok(`derived CONVEX_DEPLOYMENT=${derived} from CONVEX_DEPLOY_KEY`);
  });
  if (ref) return true;
  bad("no dev CONVEX_DEPLOY_KEY in .env.local after the EAS integration ran");
  note("open the EAS dashboard and check the Convex integration finished, then");
  note("rerun `npx vexpo convex --eas`.");
  return false;
}

async function writeUnlessSet(
  env: Map<string, string>,
  key: string,
  value: () => Promise<string> | string,
  wrote: (value: string) => string = () => `wrote ${key}`,
): Promise<void> {
  if (env.has(key)) {
    nop(`${key} already set`);
    return;
  }
  const resolved = await value();
  await ensureLine(key, resolved);
  ok(wrote(resolved));
}

async function ensureSignedIn(): Promise<void> {
  const status = await checkToken();
  if (status === "valid") return;
  yep(status === "no-token" ? "not signed in to Convex" : "Convex token expired or revoked");
  await helpAndWait({
    body: "Sign in (or refresh) with `npx convex login` in another terminal:",
    urls: [
      { label: "Convex sign-up", url: "https://convex.dev" },
      { label: "Convex dashboard", url: "https://dashboard.convex.dev" },
    ],
    allowSkip: true,
    skipLabel: "skip",
  });
}

async function selectLocalDeployment(): Promise<boolean> {
  const sel = spawn([dlx(), "convex", "deployment", "select", "local"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await sel.exited) === 0) return true;
  bad("convex deployment select local failed");
  return false;
}

function readActiveDeployment(
  env: Map<string, string>,
): { deployment: string; slug: string } | null {
  const deployment = env.get("CONVEX_DEPLOYMENT");
  if (!deployment) {
    bad("CONVEX_DEPLOYMENT missing after convex dev ran");
    return null;
  }
  const slug = deployment.split("#")[0].trim().split(":")[1];
  if (!slug) {
    bad(`invalid CONVEX_DEPLOYMENT: ${deployment}`);
    return null;
  }
  return { deployment, slug };
}

export async function runConvex(options: ConvexOptions): Promise<number> {
  section("Convex deployment");

  await ensureSignedIn();

  const localEnv = await readAll();
  const existing = await existingDeployment(options, localEnv);
  const needsProvisioning = !existing;
  const projectName = options.name ?? (await pkgName());
  const team = (process.env.CONVEX_TEAM ?? localEnv.get("CONVEX_TEAM"))?.trim() || undefined;

  const plan = planConvexDev(options, needsProvisioning, projectName, team);
  if (plan.selectLocalFirst && !(await selectLocalDeployment())) return 1;

  if (!(await connectThroughEas(options, plan.connectArgs, projectName))) return 1;

  if (needsProvisioning) ok(`provisioning Convex project '${projectName}'`);
  else ok(`connecting to existing deployment ${existing}`);

  const proc = spawn([dlx(), ...plan.devArgs]);
  if ((await proc.exited) !== 0) {
    bad("convex dev exited with a non-zero code");
    explainDevFailure(needsProvisioning, team);
    return 1;
  }

  const refreshed = await readAll();
  const active = readActiveDeployment(refreshed);
  if (!active) return 1;
  const { deployment, slug } = active;

  process.env.CONVEX_DEPLOYMENT = deployment;

  const urls = convexUrls(slug, options.local === true);
  await writeUnlessSet(refreshed, "EXPO_PUBLIC_CONVEX_URL", () => urls.url);
  await writeUnlessSet(refreshed, "EXPO_PUBLIC_CONVEX_SITE_URL", () => urls.siteUrl);
  await writeUnlessSet(
    refreshed,
    "EXPO_PUBLIC_SITE_URL",
    async () => `${await scheme()}://`,
    (v) => `wrote EXPO_PUBLIC_SITE_URL=${v}`,
  );

  await ensureIdentity(refreshed);

  await recordStep("convex", {
    deployment,
    slug,
    ...(options.local ? { local: true } : {}),
  });

  line();
  ok(`Convex deployment ready: ${BOLD}${slug}${RESET}`);
  if (options.local) note(`local backend: ${urls.url}`);
  else note(`dashboard: https://dashboard.convex.dev/d/${slug}`);
  return 0;
}

async function resolveBundleId(localEnv: Map<string, string>): Promise<string | undefined> {
  if (localEnv.has("EXPO_PUBLIC_APP_BUNDLE_ID")) {
    const existing = localEnv.get("EXPO_PUBLIC_APP_BUNDLE_ID");
    ok(`EXPO_PUBLIC_APP_BUNDLE_ID=${existing} (from .env.local); syncing to Convex`);
    return existing;
  }
  if (!process.stdin.isTTY) {
    yep("EXPO_PUBLIC_APP_BUNDLE_ID not set (non-TTY); skipping prompt");
    yep("set it in .env.local before running `vexpo apple` or building");
    return undefined;
  }
  const fromConfig = await bundleIdFallback();
  const isTemplate = !fromConfig || fromConfig.startsWith("com.example.");
  const suggested = isTemplate ? `com.example.${await pkgName()}` : fromConfig;
  const cachedHint = isTemplate ? "" : ` ${DIM}(from app.config.ts)${RESET}`;
  const raw = (
    await ask(
      `  iOS bundle id ${DIM}(reverse-DNS, e.g. com.you.app)${RESET}${cachedHint}\n  ${DIM}> ${suggested} ${RESET}`,
    )
  ).trim();
  const bundleId = raw || suggested;
  if (!BUNDLE_ID_RE.test(bundleId)) {
    throw new Error(`invalid bundle id '${bundleId}' (allowed: A-Z a-z 0-9 . -)`);
  }
  await ensureLine("EXPO_PUBLIC_APP_BUNDLE_ID", bundleId);
  ok(`wrote EXPO_PUBLIC_APP_BUNDLE_ID=${bundleId}`);
  return bundleId;
}

async function resolveTeamId(localEnv: Map<string, string>): Promise<string | undefined> {
  if (localEnv.has("EXPO_PUBLIC_APPLE_TEAM_ID")) {
    const existing = localEnv.get("EXPO_PUBLIC_APPLE_TEAM_ID");
    nop(`EXPO_PUBLIC_APPLE_TEAM_ID already set (${existing})`);
    return existing;
  }
  if (!process.stdin.isTTY) {
    yep("EXPO_PUBLIC_APPLE_TEAM_ID not set (non-TTY); skipping prompt");
    return undefined;
  }
  const fromConfig = await appleTeamIdFallback();
  const cachedHint = fromConfig ? ` ${DIM}[${fromConfig} from app.config.ts]${RESET}` : "";
  const raw = (
    await ask(
      `  Apple Team id ${DIM}(10-char alphanumeric, find at developer.apple.com/account)${RESET}${cachedHint}\n  ${DIM}> ${RESET}`,
    )
  )
    .trim()
    .toUpperCase();
  const resolved = resolveTeamIdInput(raw, fromConfig);
  if (resolved.kind === "skip") {
    yep("EXPO_PUBLIC_APPLE_TEAM_ID not set (optional for lite; `vexpo full` asks again)");
    return undefined;
  }
  if (resolved.kind === "invalid") {
    throw new Error(
      `invalid Apple Team id '${resolved.value}' (must be 10 uppercase alphanumeric)`,
    );
  }
  await ensureLine("EXPO_PUBLIC_APPLE_TEAM_ID", resolved.value);
  ok(`wrote EXPO_PUBLIC_APPLE_TEAM_ID=${resolved.value}`);
  return resolved.value;
}

export async function ensureIdentity(localEnv: Map<string, string>): Promise<void> {
  const bundleId = await resolveBundleId(localEnv);
  const teamId = await resolveTeamId(localEnv);

  if (bundleId) {
    const devBundleId = `${bundleId}.dev`;
    await convexEnvSet("APP_BUNDLE_ID", devBundleId);
    ok(`Convex env: APP_BUNDLE_ID=${devBundleId} (dev deployment serves the dev variant)`);
  }
  if (teamId) {
    await convexEnvSet("APPLE_TEAM_ID", teamId);
    ok(`Convex env: APPLE_TEAM_ID=${teamId}`);
  }
}
