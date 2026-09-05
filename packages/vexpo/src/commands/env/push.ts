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
  MANUAL_EAS_SECRETS,
  missingKeys,
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

export type EnvPushOptions = {
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

export function planRowValue(entry: SyncEntry): string {
  if (entry.destinations.some((d) => d.type === "convex")) {
    return `fp: ${fingerprint(entry.value)} ${DIM}(${entry.value.length}b)${RESET}`;
  }
  return shortValue(entry.value);
}

function describeDest(d: Destination): string {
  if (d.type === "convex") return `convex env (${d.channel}) → ${d.key}`;
  return `eas env (${d.environments.join(",")}) → ${d.key}`;
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

  const [convexDev, convexProd, easDev, easPreview, easProd] = await Promise.all([
    convexEnvMap().catch(() => null),
    convexEnvMap({ prod: true, envFile: prodEnvFile }).catch(() => null),
    hasEasProject
      ? easEnvList("development").then((m) => m ?? new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
    hasEasProject
      ? easEnvList("preview").then((m) => m ?? new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
    hasEasProject
      ? easEnvList("production").then((m) => m ?? new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
  ]);

  return {
    convexDev,
    convexProd,
    easByEnv: { development: easDev, preview: easPreview, production: easProd },
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
      reason: "couldn't read convex env (auth/CLI failure). run `npx convex login` and re-run",
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
      reason: "no eas projectId. run setup:eas first",
    };
  }
  const currents = dest.environments.map((env) => remote.easByEnv[env].get(dest.key));
  if (currents.every((current) => current === newValue)) {
    return { destination: dest, current: newValue, status: "noop" };
  }
  const create = currents.some((current) => current === undefined);
  return { destination: dest, current: undefined, status: create ? "create" : "update" };
}

export function resolveDestination(
  dest: Destination,
  newValue: string,
  remote: RemoteState,
): ResolvedDestination {
  return dest.type === "convex"
    ? resolveConvexDestination(dest, newValue, remote)
    : resolveEasDestination(dest, newValue, remote);
}

export type FilePlan = {
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
  create: "\x1b[32mcreate\x1b[0m",
  update: "\x1b[33mupdate\x1b[0m",
  noop: "\x1b[2mnoop\x1b[0m",
  blocked: "\x1b[31mblocked\x1b[0m",
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
  past: string;
  present: string;
  entries: Array<[string, string]>;
  push: (tmp: string) => Promise<unknown>;
};

function planBatches(plan: FilePlan): Batch[] {
  const convex = new Map<"dev" | "prod", Array<[string, string]>>();
  const eas = new Map<string, { envs: EasEnvironment[]; entries: Array<[string, string]> }>();

  for (const row of plan.rows) {
    for (const r of row.resolved) {
      if (r.status === "noop" || r.status === "blocked") continue;
      if (r.destination.type === "convex") {
        const list = convex.get(r.destination.channel) ?? [];
        list.push([r.destination.key, row.entry.value]);
        convex.set(r.destination.channel, list);
      } else {
        const key = [...r.destination.environments].toSorted().join(",");
        const cur = eas.get(key) ?? { envs: [...r.destination.environments], entries: [] };
        cur.entries.push([r.destination.key, row.entry.value]);
        eas.set(key, cur);
      }
    }
  }

  return [
    ...[...convex].map(([channel, entries]) => ({
      label: `convex(${channel})`,
      past: "bulk-set",
      present: "bulk-set",
      entries,
      push: (tmp: string) =>
        convexEnvSetFromFile(
          tmp,
          channel === "prod" ? { prod: true, envFile: plan.sourceFile } : undefined,
          { force: true },
        ),
    })),
    ...[...eas.values()].map(({ envs, entries }) => ({
      label: `eas(${envs.join(",")})`,
      past: "pushed",
      present: "push",
      entries,
      push: (tmp: string) => easEnvPush({ path: tmp, environments: envs, force: true }),
    })),
  ].filter((b) => b.entries.length > 0);
}

export async function applyPlan(plan: FilePlan): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  for (const { label, past, present, entries, push } of planBatches(plan)) {
    try {
      await withTempEnvFile(
        entries.map(([k, v]) => `${k}=${v}`),
        push,
      );
      ok(`${label} ${past} ${entries.length} var${plural(entries.length)}`);
      for (const [k] of entries) note(`  ${k}`);
      applied += entries.length;
    } catch (err) {
      bad(`${label} ${present} failed: ${errText(err)}`);
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

function reportMissing(sources: EnvSource[]): void {
  const missing = missingKeys(sources);
  const total = missing.dev.length + missing.prod.length;
  if (total === 0) return;
  line();
  note(`${BOLD}Missing from source files (${total} keys total)${RESET}`);
  for (const [channel, keys] of [
    ["dev", missing.dev],
    ["prod", missing.prod],
  ] as const) {
    if (keys.length === 0) continue;
    const more = keys.length > 8 ? "…" : "";
    note(`  ${channel} (${keys.length}): ${keys.slice(0, 8).join(", ")}${more}`);
  }
}

function reportManualSecrets(sources: EnvSource[]): void {
  const hits = sources.flatMap((s) =>
    Object.keys(MANUAL_EAS_SECRETS)
      .filter((k) => s.entries.has(k))
      .map((key) => ({ key, file: s.path })),
  );
  if (hits.length === 0) return;
  line();
  yep(`${hits.length} secret-visibility key${plural(hits.length)} detected. set manually:`);
  for (const { key, file } of hits) {
    note(`  ${BOLD}${key}${RESET} ${DIM}(${file})${RESET}`);
    note(`    ${DIM}${MANUAL_EAS_SECRETS[key]}${RESET}`);
  }
  note(`${DIM}lite skips these to avoid pushing secrets at default visibility${RESET}`);
}

type PlanTotals = { actionable: number; conflicts: number; blocked: number };

function printPlans(plans: FilePlan[]): PlanTotals {
  const totals: PlanTotals = { actionable: 0, conflicts: 0, blocked: 0 };
  for (const plan of plans) {
    const one = printFilePlan(plan);
    totals.actionable += one.actionable;
    totals.conflicts += one.conflicts;
    totals.blocked += one.blocked;
  }
  return totals;
}

function reportDryRun(totals: PlanTotals): void {
  line();
  if (totals.actionable > 0) {
    const blocked = totals.blocked > 0 ? `, ${totals.blocked} blocked` : "";
    note(
      `${totals.actionable} action${plural(totals.actionable)} would be applied${blocked}; --dry-run, exiting`,
    );
    return;
  }
  if (totals.blocked > 0) {
    note(
      `0 actionable, ${totals.blocked} blocked; --dry-run, exiting (resolve blockers and re-run)`,
    );
    return;
  }
  ok("nothing to do. all source values match destinations (--dry-run)");
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
  bad(`${prod?.path ?? "prod source"} has no prod-scoped CONVEX_DEPLOY_KEY or CONVEX_DEPLOYMENT`);
  note("prod env would silently write to the DEV deployment (the dev key shadows --prod)");
  note("add a `prod:` CONVEX_DEPLOY_KEY (or CONVEX_DEPLOYMENT) to the prod file and re-run");
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
    bad(`${totalFail} verification failure${plural(totalFail)}`);
    note("re-run `vexpo doctor` for full output, or fix the env values and re-run");
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
    yep(
      `${totals.blocked} blocked, 0 actionable. resolve blockers (run \`vexpo full\` first) and re-run`,
    );
    return 2;
  }
  ok("nothing to do. all source values match destinations");
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
    note("run `npx convex login` to refresh, then re-run");
    return null;
  }

  const sources = await readSources({ local: options.localFile, prod: options.prodFile });
  if (sources.length === 0) {
    yep("no source files found");
    note("checked: .env.local, .env.prod, .env.production");
    note("create one with the values you want synced and re-run");
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
  note("for full provisioning (Resend key, Apple JWT, signups), run `vexpo full`");
  return 0;
}

export async function runEnvPush(options: EnvPushOptions): Promise<number> {
  section("Env push");

  const sources = await readSourcesOrExplain(options);
  if (!sources) return 1;

  reportUnrecognized(sources);
  reportMissing(sources);

  const remote = await readRemoteState(sources.find((s) => s.channel === "prod")?.path);
  if (!remote.hasEasProject) yep("no EAS projectId in app.json. EAS env routes will be blocked");

  reportManualSecrets(sources);

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
