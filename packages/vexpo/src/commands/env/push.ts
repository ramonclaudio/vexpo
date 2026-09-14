import {
  envMap as convexEnvMap,
  envSetFromFile as convexEnvSetFromFile,
} from "../../lib/convex-env.ts";
import { checkToken } from "../../lib/convex-management.ts";
import {
  envList as easEnvList,
  envPush as easEnvPush,
  resolveProjectId,
  type EasEnvironment,
} from "../../lib/eas-project.ts";
import {
  buildPlan,
  readSources,
  unrecognizedKeys,
  type EnvSource,
  withTempEnvFile,
  type Channel,
  type Destination,
  type SyncEntry,
} from "../../lib/env-files.ts";
import { fingerprint } from "../../lib/state.ts";
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
  plural,
  section,
  yep,
} from "../../lib/output.ts";
import { renderVerifyResults } from "../../lib/verify-render.ts";
import { readContext, summarize, verifyAll } from "../../lib/verify.ts";

type EnvPushOptions = {
  force?: boolean;
  dryRun?: boolean;
  noVerify?: boolean;
  strict?: boolean;
  localFile?: string;
  prodFile?: string;
};

function shortValue(v: string): string {
  if (v.length <= 60) return v;
  return `${v.slice(0, 30)}…${v.slice(-12)} ${DIM}(${v.length}b)${RESET}`;
}

function planRowValue(entry: SyncEntry): string {
  if (entry.destinations.some((d) => d.type === "convex")) {
    return `fp: ${fingerprint(entry.value)} ${DIM}(${entry.value.length}b)${RESET}`;
  }
  return shortValue(entry.value);
}

function describeDest(d: Destination): string {
  if (d.type === "convex") return `convex env (${d.channel}) → ${d.key}`;
  return `eas env (${d.environment}) → ${d.key}`;
}

type RemoteState = {
  convexDev: Map<string, string> | null;
  convexProd: Map<string, string> | null;
  easByEnv: Record<EasEnvironment, Map<string, string>>;
  hasEasProject: boolean;
};

async function readRemoteState(prodEnvFile?: string): Promise<RemoteState> {
  const projectId = await resolveProjectId();
  const hasEasProject = !!projectId;

  const [convexDev, convexProd, easDev, easProd] = await Promise.all([
    convexEnvMap().catch(() => null),
    convexEnvMap({ prod: true, envFile: prodEnvFile }).catch(() => null),
    hasEasProject
      ? easEnvList("development").then((m) => m ?? new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
    hasEasProject
      ? easEnvList("production").then((m) => m ?? new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
  ]);

  return {
    convexDev,
    convexProd,
    easByEnv: { development: easDev, production: easProd },
    hasEasProject,
  };
}

type DiffStatus = "create" | "update" | "noop" | "blocked";

type ResolvedDestination = {
  destination: Destination;
  current: string | undefined;
  status: DiffStatus;
  reason?: string;
};

function resolveConvexDestination(
  dest: Extract<Destination, { type: "convex" }>,
  newValue: string,
  remote: RemoteState,
): ResolvedDestination {
  const map = dest.channel === "prod" ? remote.convexProd : remote.convexDev;
  if (map === null) {
    return {
      destination: dest,
      current: undefined,
      status: "blocked",
      reason: "couldn't read the Convex env. run `npx convex login` and try again",
    };
  }
  const current = map.get(dest.key);
  if (current === newValue) return { destination: dest, current, status: "noop" };
  return { destination: dest, current, status: current === undefined ? "create" : "update" };
}

function resolveEasDestination(
  dest: Extract<Destination, { type: "eas" }>,
  newValue: string,
  remote: RemoteState,
): ResolvedDestination {
  if (!remote.hasEasProject) {
    return {
      destination: dest,
      current: undefined,
      status: "blocked",
      reason: "no EAS project id yet. run `vexpo full` first",
    };
  }
  const current = remote.easByEnv[dest.environment].get(dest.key);
  if (current === newValue) return { destination: dest, current, status: "noop" };
  return { destination: dest, current, status: current === undefined ? "create" : "update" };
}

function resolveDestination(
  dest: Destination,
  newValue: string,
  remote: RemoteState,
): ResolvedDestination {
  return dest.type === "convex"
    ? resolveConvexDestination(dest, newValue, remote)
    : resolveEasDestination(dest, newValue, remote);
}

type FilePlan = {
  sourceFile: string;
  channel: Channel;
  rows: Array<{ entry: SyncEntry; resolved: ResolvedDestination[] }>;
};

function groupByFile(entries: SyncEntry[], remote: RemoteState): FilePlan[] {
  const byFile = new Map<string, FilePlan>();
  for (const entry of entries) {
    const resolved = entry.destinations.map((d) => resolveDestination(d, entry.value, remote));
    const key = entry.sourceFile;
    const plan = byFile.get(key) ?? { sourceFile: key, channel: entry.channel, rows: [] };
    byFile.set(key, plan);
    plan.rows.push({ entry, resolved });
  }
  return [...byFile.values()];
}

const STATUS_TAG: Record<DiffStatus, string> = {
  create: `${GREEN}create${RESET}`,
  update: `${YELLOW}update${RESET}`,
  noop: `${DIM}noop${RESET}`,
  blocked: `${RED}blocked${RESET}`,
};

function printResolved(resolved: ResolvedDestination, newValue: string): void {
  const reason = resolved.reason ? ` ${DIM}(${resolved.reason})${RESET}` : "";
  const diff =
    resolved.status === "update" && resolved.current !== undefined
      ? ` ${DIM}fp: ${fingerprint(resolved.current)} \u2192 ${fingerprint(newValue)}${RESET}`
      : "";
  line(
    `      ${STATUS_TAG[resolved.status]}  ${describeDest(resolved.destination)}${diff}${reason}`,
  );
}

type PlanCounts = { actionable: number; conflicts: number; blocked: number };

function printFilePlan(plan: FilePlan): PlanCounts {
  section(`${plan.sourceFile} ${DIM}(${plan.channel})${RESET}`);
  if (plan.rows.length === 0) {
    nop("(no recognized keys in this file)");
    return { actionable: 0, conflicts: 0, blocked: 0 };
  }
  const counts: PlanCounts = { actionable: 0, conflicts: 0, blocked: 0 };
  for (const row of plan.rows) {
    line(`  ${BOLD}${row.entry.sourceKey}${RESET}  ${DIM}= ${planRowValue(row.entry)}${RESET}`);
    for (const resolved of row.resolved) {
      printResolved(resolved, row.entry.value);
      if (resolved.status === "create" || resolved.status === "update") counts.actionable += 1;
      if (resolved.status === "update") counts.conflicts += 1;
      if (resolved.status === "blocked") counts.blocked += 1;
    }
  }
  return counts;
}

type Batch = {
  label: string;
  entries: Array<[string, string]>;
  push: (tmp: string) => Promise<unknown>;
};

function planBatches(plan: FilePlan): Batch[] {
  const convex = new Map<"dev" | "prod", Array<[string, string]>>();
  const eas = new Map<EasEnvironment, Array<[string, string]>>();

  for (const row of plan.rows) {
    for (const r of row.resolved) {
      if (r.status === "noop" || r.status === "blocked") continue;
      const pair: [string, string] = [r.destination.key, row.entry.value];
      if (r.destination.type === "convex") {
        convex.set(r.destination.channel, [...(convex.get(r.destination.channel) ?? []), pair]);
      } else {
        eas.set(r.destination.environment, [...(eas.get(r.destination.environment) ?? []), pair]);
      }
    }
  }

  return [
    ...[...convex].map(([channel, entries]) => ({
      label: `convex(${channel})`,
      entries,
      push: (tmp: string) =>
        convexEnvSetFromFile(
          tmp,
          channel === "prod" ? { prod: true, envFile: plan.sourceFile } : undefined,
          { force: true },
        ),
    })),
    ...[...eas].map(([environment, entries]) => ({
      label: `eas(${environment})`,
      entries,
      push: (tmp: string) => easEnvPush({ path: tmp, environment, force: true }),
    })),
  ];
}

async function applyPlan(plan: FilePlan): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  for (const { label, entries, push } of planBatches(plan)) {
    try {
      await withTempEnvFile(
        entries.map(([k, v]) => `${k}=${v}`),
        push,
      );
      ok(`${label} set ${entries.length} var${plural(entries.length)}`);
      for (const [k] of entries) note(`  ${k}`);
      applied += entries.length;
    } catch (err) {
      bad(`${label} push failed: ${errText(err)}`);
      failed += entries.length;
    }
  }
  return { applied, failed };
}

function reportUnrecognized(sources: EnvSource[]): void {
  const unknown = unrecognizedKeys(sources);
  if (unknown.length === 0) return;
  yep(`${unknown.length} unrecognized key${plural(unknown.length)} ignored:`);
  for (const k of unknown) note(`  ${k}`);
}

function printPlans(plans: FilePlan[]): PlanCounts {
  const totals: PlanCounts = { actionable: 0, conflicts: 0, blocked: 0 };
  for (const plan of plans) {
    const one = printFilePlan(plan);
    totals.actionable += one.actionable;
    totals.conflicts += one.conflicts;
    totals.blocked += one.blocked;
  }
  return totals;
}

function reportDryRun(totals: PlanCounts): void {
  line();
  if (totals.actionable > 0) {
    const blocked = totals.blocked > 0 ? `, ${totals.blocked} blocked` : "";
    note(
      `${totals.actionable} change${plural(totals.actionable)} would be applied${blocked}. dry run, nothing pushed`,
    );
    return;
  }
  if (totals.blocked > 0) {
    note(`no changes possible, ${totals.blocked} blocked. dry run, nothing pushed`);
    return;
  }
  ok("nothing to do, every value already matches (dry run)");
}

function prodConvexWritesAreSafe(entries: SyncEntry[], sources: EnvSource[]): boolean {
  const writesProd = entries.some(
    (e) => e.channel === "prod" && e.destinations.some((d) => d.type === "convex"),
  );
  if (!writesProd) return true;

  const prod = sources.find((s) => s.channel === "prod");
  const deployKey = prod?.entries.get("CONVEX_DEPLOY_KEY") ?? "";
  const selector = prod?.entries.get("CONVEX_DEPLOYMENT") ?? "";
  if (deployKey.startsWith("prod:") || selector.startsWith("prod:")) return true;

  line();
  bad(`${prod?.path ?? "the prod file"} has no prod CONVEX_DEPLOY_KEY or CONVEX_DEPLOYMENT`);
  note("without one the prod values would land on the dev deployment");
  note("add a `prod:` CONVEX_DEPLOY_KEY or CONVEX_DEPLOYMENT to that file and try again");
  return false;
}

async function applyAllPlans(
  plans: FilePlan[],
  force: boolean,
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  for (const plan of plans) {
    if (!force && process.stdin.isTTY) {
      line();
      if (!(await askYesNo(`Apply ${plan.sourceFile} (${plan.channel})?`, true))) {
        nop(`skipped ${plan.sourceFile}`);
        continue;
      }
    }
    const result = await applyPlan(plan);
    applied += result.applied;
    failed += result.failed;
  }
  return { applied, failed };
}

async function verifyAfterPush(channels: Array<"dev" | "prod">, strict: boolean): Promise<number> {
  let totalFail = 0;
  let totalWarn = 0;
  for (const channel of channels) {
    section(`Verify (${channel})`);
    const checks = await verifyAll(await readContext(channel));
    renderVerifyResults(checks, "compact");
    const s = summarize(checks);
    totalFail += s.fail;
    totalWarn += s.warn;
    const warn = s.warn > 0 ? `, ${YELLOW}${s.warn} warn${RESET}` : "";
    const fail = s.fail > 0 ? `, ${RED}${s.fail} fail${RESET}` : "";
    const skip = s.skip > 0 ? `, ${DIM}${s.skip} skip${RESET}` : "";
    line(`  ${GREEN}${s.ok} ok${RESET}${warn}${fail}${skip}`);
  }
  if (totalFail > 0) {
    line();
    bad(`${totalFail} check${plural(totalFail)} failed`);
    note("run `vexpo doctor` for the full output, or fix the values and push again");
    return 1;
  }
  if (strict && totalWarn > 0) {
    line();
    bad(`${totalWarn} warning${plural(totalWarn)} with --strict`);
    return 1;
  }
  return 0;
}

function nothingToDo(totals: { blocked: number }): number {
  line();
  if (totals.blocked > 0) {
    yep(`${totals.blocked} blocked, nothing else to do. run \`vexpo full\` first, then push again`);
    return 2;
  }
  ok("nothing to do, every value already matches");
  return 0;
}

function verifyPushed(sources: EnvSource[], strict: boolean): Promise<number> {
  const channels: Array<"dev" | "prod"> = sources.some((s) => s.channel === "prod")
    ? ["dev", "prod"]
    : ["dev"];
  return verifyAfterPush(channels, strict);
}

async function readSourcesOrExplain(options: EnvPushOptions): Promise<EnvSource[] | null> {
  if ((await checkToken()) === "unauthorized") {
    bad("Convex login expired or revoked");
    note("run `npx convex login`, then push again");
    return null;
  }

  const sources = await readSources({ local: options.localFile, prod: options.prodFile });
  if (sources.length === 0) {
    yep("no env files found");
    note("checked .env.local, .env.prod and .env.production");
    note("create one with the values you want pushed and try again");
    return null;
  }
  for (const source of sources) {
    ok(`source: ${source.path} ${DIM}(${source.channel}, ${source.entries.size} keys)${RESET}`);
  }
  return sources;
}

async function applyAndReport(
  filePlans: FilePlan[],
  sources: EnvSource[],
  totals: PlanCounts,
  options: EnvPushOptions,
): Promise<number> {
  line();
  if (totals.conflicts > 0) {
    note(
      `${totals.conflicts} update${plural(totals.conflicts)} will overwrite existing values (fingerprints shown above)`,
    );
  }

  const { applied, failed } = await applyAllPlans(filePlans, options.force === true);

  line();
  if (failed > 0) {
    bad(`${applied} applied, ${failed} failed`);
    return 1;
  }
  ok(`${applied} value${plural(applied)} synced`);

  if (!options.noVerify) {
    const code = await verifyPushed(sources, options.strict === true);
    if (code !== 0) return code;
  }

  line();
  note("for the rest (Resend, Sign in with Apple, signups), run `vexpo full`");
  return 0;
}

export async function runEnvPush(options: EnvPushOptions): Promise<number> {
  section("Env push");

  const sources = await readSourcesOrExplain(options);
  if (!sources) return 1;

  reportUnrecognized(sources);

  const remote = await readRemoteState(sources.find((s) => s.channel === "prod")?.path);
  if (!remote.hasEasProject) yep("no EAS project id in app.json, so nothing can go to EAS yet");

  const entries = buildPlan(sources);
  const filePlans = groupByFile(entries, remote);
  const totals = printPlans(filePlans);

  if (options.dryRun) {
    reportDryRun(totals);
    return 0;
  }
  if (totals.actionable === 0) return nothingToDo(totals);
  if (!prodConvexWritesAreSafe(entries, sources)) return 1;

  return applyAndReport(filePlans, sources, totals, options);
}
