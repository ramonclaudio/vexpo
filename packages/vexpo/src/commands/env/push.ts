/**
 * `vexpo env push`. lite-mode env sync. Reads .env.local + .env.prod (or
 * .env.production), classifies each key by destination via the routing table
 * in env-files.ts, and pushes to Convex env (dev + prod) and EAS env
 * (development + preview + production).
 *
 * Does NOT provision Resend keys, sign Apple JWTs, run `eas init`, or walk
 * signups. For greenfield setup with full provisioning, use `vexpo full`.
 *
 * After sync, runs the same verification battery as `vexpo doctor` -
 * auth-checks each credential and cross-references bundle id / team id /
 * Services ID. Exits non-zero on credential failures (e.g. Resend key
 * rejected, Apple JWT expired, bundle id mismatch). Pass --no-verify
 * to skip.
 *
 * Secret-visibility EAS env vars (the JWT rotation cron consumes these) are
 * NOT pushed by env push. They need explicit `eas env:create --visibility
 * secret`. We print the exact commands when we see those keys in source
 * files. See MANUAL_EAS_SECRETS in env-files.ts.
 */

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
} from "../../lib/eas-env.ts";
import {
  buildPlan,
  MANUAL_EAS_SECRETS,
  missingKeys,
  readSources,
  unrecognizedKeys,
  type Channel,
  type Destination,
  type SyncEntry,
} from "../../lib/env-files.ts";
import { fingerprint, recordStep } from "../../lib/state.ts";
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
} from "../../lib/output.ts";
import { readContext, summarize, verifyAll, type Check } from "../../lib/verify.ts";

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

function describeDest(d: Destination): string {
  if (d.type === "convex") return `convex env (${d.channel}) → ${d.key}`;
  return `eas env (${d.environments.join(",")}) → ${d.key}`;
}

type RemoteState = {
  convexDev: Map<string, string>;
  convexProd: Map<string, string>;
  easByEnv: Record<EasEnvironment, Map<string, string>>;
  hasEasProject: boolean;
};

async function readRemoteState(prodEnvFile?: string): Promise<RemoteState> {
  const projectId = await resolveProjectId();
  const hasEasProject = !!projectId;

  const [convexDev, convexProd, easDev, easPreview, easProd] = await Promise.all([
    convexEnvMap().catch(() => new Map<string, string>()),
    convexEnvMap({ prod: true, envFile: prodEnvFile }).catch(() => new Map<string, string>()),
    hasEasProject
      ? easEnvList("development").catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
    hasEasProject
      ? easEnvList("preview").catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
    hasEasProject
      ? easEnvList("production").catch(() => new Map<string, string>())
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

function resolveDestination(
  dest: Destination,
  newValue: string,
  remote: RemoteState,
): ResolvedDestination {
  if (dest.type === "convex") {
    const map = dest.channel === "prod" ? remote.convexProd : remote.convexDev;
    const current = map.get(dest.key);
    if (current === newValue) return { destination: dest, current, status: "noop" };
    return { destination: dest, current, status: current === undefined ? "create" : "update" };
  }
  // eas
  if (!remote.hasEasProject) {
    return {
      destination: dest,
      current: undefined,
      status: "blocked",
      reason: "no eas projectId. run setup:eas first",
    };
  }
  let create = false;
  let update = false;
  for (const env of dest.environments) {
    const cur = remote.easByEnv[env].get(dest.key);
    if (cur === undefined) create = true;
    else if (cur !== newValue) update = true;
  }
  if (!create && !update) return { destination: dest, current: newValue, status: "noop" };
  return {
    destination: dest,
    current: undefined,
    status: create ? "create" : "update",
  };
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
    if (!byFile.has(key)) byFile.set(key, { sourceFile: key, channel: entry.channel, rows: [] });
    byFile.get(key)!.rows.push({ entry, resolved });
  }
  return [...byFile.values()];
}

function printFilePlan(plan: FilePlan): {
  actionable: number;
  conflicts: number;
  blocked: number;
} {
  section(`${plan.sourceFile} ${DIM}(${plan.channel})${RESET}`);
  if (plan.rows.length === 0) {
    nop("(no recognized keys in this file)");
    return { actionable: 0, conflicts: 0, blocked: 0 };
  }
  let actionable = 0;
  let conflicts = 0;
  let blocked = 0;
  for (const row of plan.rows) {
    line(`  ${BOLD}${row.entry.sourceKey}${RESET}  ${DIM}= ${shortValue(row.entry.value)}${RESET}`);
    for (const r of row.resolved) {
      const tag =
        r.status === "create"
          ? "\x1b[32mcreate\x1b[0m"
          : r.status === "update"
            ? "\x1b[33mupdate\x1b[0m"
            : r.status === "noop"
              ? "\x1b[2mnoop\x1b[0m"
              : "\x1b[31mblocked\x1b[0m";
      const destStr = describeDest(r.destination);
      const reason = r.reason ? ` ${DIM}(${r.reason})${RESET}` : "";
      const diff =
        r.status === "update" && r.current !== undefined
          ? ` ${DIM}fp: ${fingerprint(r.current)} → ${fingerprint(row.entry.value)}${RESET}`
          : "";
      line(`      ${tag}  ${destStr}${diff}${reason}`);
      if (r.status === "create" || r.status === "update") actionable += 1;
      if (r.status === "update") conflicts += 1;
      if (r.status === "blocked") blocked += 1;
    }
  }
  return { actionable, conflicts, blocked };
}

/**
 * Batch writes by destination so we do one shellout per (target, env-set)
 * instead of one per key. Convex bulk via `convex env set --from-file`,
 * EAS bulk via `eas env:push`.
 */
async function applyPlan(
  plan: FilePlan,
  opts: { force?: boolean } = {},
): Promise<{ applied: number; failed: number }> {
  const convexBatches = new Map<"dev" | "prod", Array<[string, string]>>();
  const easBatches = new Map<
    string,
    { envs: EasEnvironment[]; entries: Array<[string, string]> }
  >();

  for (const row of plan.rows) {
    for (const r of row.resolved) {
      if (r.status === "noop" || r.status === "blocked") continue;
      if (r.destination.type === "convex") {
        const list = convexBatches.get(r.destination.channel) ?? [];
        list.push([r.destination.key, row.entry.value]);
        convexBatches.set(r.destination.channel, list);
      } else {
        const key = [...r.destination.environments].toSorted().join(",");
        const cur = easBatches.get(key) ?? {
          envs: [...r.destination.environments],
          entries: [],
        };
        cur.entries.push([r.destination.key, row.entry.value]);
        easBatches.set(key, cur);
      }
    }
  }

  let applied = 0;
  let failed = 0;
  const { writeFile, unlink, mkdtemp, rmdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  for (const [channel, entries] of convexBatches) {
    if (entries.length === 0) continue;
    // Plaintext secrets go into a fresh private mkdtemp dir (0700, unguessable
    // name) so no predictable or pre-planted path can capture them or dodge the
    // 0600 file mode. Removed in finally.
    const dir = await mkdtemp(join(tmpdir(), "vexpo-env-"));
    const tmp = join(dir, "convex.env");
    try {
      await writeFile(tmp, entries.map(([k, v]) => `${k}=${v}`).join("\n") + "\n", {
        mode: 0o600,
      });
      await convexEnvSetFromFile(
        tmp,
        channel === "prod" ? { prod: true, envFile: plan.sourceFile } : undefined,
        { force: opts.force ?? false },
      );
      ok(`convex(${channel}) bulk-set ${entries.length} var${entries.length === 1 ? "" : "s"}`);
      for (const [k] of entries) note(`  ${k}`);
      applied += entries.length;
    } catch (err) {
      bad(`convex(${channel}) bulk-set failed: ${err instanceof Error ? err.message : err}`);
      failed += entries.length;
    } finally {
      await unlink(tmp).catch(() => {});
      await rmdir(dir).catch(() => {});
    }
  }

  for (const { envs, entries } of easBatches.values()) {
    if (entries.length === 0) continue;
    const dir = await mkdtemp(join(tmpdir(), "vexpo-env-"));
    const tmp = join(dir, "eas.env");
    try {
      await writeFile(tmp, entries.map(([k, v]) => `${k}=${v}`).join("\n") + "\n", {
        mode: 0o600,
      });
      await easEnvPush({ path: tmp, environments: envs, force: true });
      ok(`eas(${envs.join(",")}) pushed ${entries.length} var${entries.length === 1 ? "" : "s"}`);
      for (const [k] of entries) note(`  ${k}`);
      applied += entries.length;
    } catch (err) {
      bad(`eas(${envs.join(",")}) push failed: ${err instanceof Error ? err.message : err}`);
      failed += entries.length;
    } finally {
      await unlink(tmp).catch(() => {});
      await rmdir(dir).catch(() => {});
    }
  }

  return { applied, failed };
}

export async function runEnvPush(options: EnvPushOptions): Promise<number> {
  section("Env push");

  // Fail loud on an expired/revoked Convex login before the Convex env writes
  // hit a cryptic auth error. "no-token" is left alone (CI may use a deploy key).
  if ((await checkToken()) === "unauthorized") {
    bad("Convex login expired or revoked");
    note("run `npx convex login` to refresh, then re-run");
    return 1;
  }

  const sources = await readSources({ local: options.localFile, prod: options.prodFile });
  if (sources.length === 0) {
    yep("no source files found");
    note("checked: .env.local, .env.prod, .env.production");
    note("create one with the values you want synced and re-run");
    return 1;
  }
  for (const s of sources) {
    ok(`source: ${s.path} ${DIM}(${s.channel}, ${s.entries.size} keys)${RESET}`);
  }

  const unknown = unrecognizedKeys(sources);
  if (unknown.length > 0) {
    yep(`${unknown.length} unrecognized key${unknown.length === 1 ? "" : "s"} ignored:`);
    for (const k of unknown) note(`  ${k}`);
  }

  const missing = missingKeys(sources);
  const totalMissing = missing.dev.length + missing.prod.length;
  if (totalMissing > 0) {
    line();
    note(`${BOLD}Missing from source files (${totalMissing} keys total)${RESET}`);
    if (missing.dev.length > 0) {
      note(
        `  dev (${missing.dev.length}): ${missing.dev.slice(0, 8).join(", ")}${missing.dev.length > 8 ? "…" : ""}`,
      );
    }
    if (missing.prod.length > 0) {
      note(
        `  prod (${missing.prod.length}): ${missing.prod.slice(0, 8).join(", ")}${missing.prod.length > 8 ? "…" : ""}`,
      );
    }
  }

  const prodEnvFile = sources.find((s) => s.channel === "prod")?.path;
  const remote = await readRemoteState(prodEnvFile);
  if (!remote.hasEasProject) yep("no EAS projectId in app.json. EAS env routes will be blocked");

  // Detect any MANUAL_EAS_SECRETS in ANY source (dev or prod). they need an
  // explicit `eas env:create --visibility secret`, not bulk push. A dev-file
  // hit (e.g. CONVEX_DEPLOY_KEY in .env.local) is just as silently dropped.
  const manualHits: Array<{ key: string; file: string }> = [];
  for (const s of sources) {
    for (const k of Object.keys(MANUAL_EAS_SECRETS)) {
      if (s.entries.has(k)) manualHits.push({ key: k, file: s.path });
    }
  }
  if (manualHits.length > 0) {
    line();
    yep(
      `${manualHits.length} secret-visibility key${manualHits.length === 1 ? "" : "s"} detected. set manually:`,
    );
    for (const { key, file } of manualHits) {
      note(`  ${BOLD}${key}${RESET} ${DIM}(${file})${RESET}`);
      note(`    ${DIM}${MANUAL_EAS_SECRETS[key]}${RESET}`);
    }
    note(`${DIM}lite skips these to avoid pushing secrets at default visibility${RESET}`);
  }

  const entries = buildPlan(sources);
  const filePlans = groupByFile(entries, remote);

  let totalActionable = 0;
  let totalConflicts = 0;
  let totalBlocked = 0;
  for (const plan of filePlans) {
    const { actionable, conflicts, blocked } = printFilePlan(plan);
    totalActionable += actionable;
    totalConflicts += conflicts;
    totalBlocked += blocked;
  }

  // Dry-run exits early with no side effects (no state writes, no API calls).
  if (options.dryRun) {
    line();
    if (totalActionable === 0 && totalBlocked === 0) {
      ok("nothing to do. all source values match destinations (--dry-run)");
    } else if (totalActionable === 0 && totalBlocked > 0) {
      note(
        `0 actionable, ${totalBlocked} blocked; --dry-run, exiting (resolve blockers and re-run)`,
      );
    } else {
      note(
        `${totalActionable} action${totalActionable === 1 ? "" : "s"} would be applied${totalBlocked > 0 ? `, ${totalBlocked} blocked` : ""}; --dry-run, exiting`,
      );
    }
    return 0;
  }

  if (totalActionable === 0) {
    line();
    if (totalBlocked > 0) {
      yep(
        `${totalBlocked} blocked, 0 actionable. resolve blockers (run \`vexpo full\` first) and re-run`,
      );
      return 2;
    }
    ok("nothing to do. all source values match destinations");
    await recordStep("accounts", { mode: "lite", verifiedAt: new Date().toISOString() });
    return 0;
  }

  // Prod Convex writes go through `convex env set --env-file <prod source>` so
  // the prod deploy key in that file selects the prod deployment. If the prod
  // source carries no prod-scoped CONVEX_DEPLOY_KEY/CONVEX_DEPLOYMENT, the CLI
  // falls back to the dev key in .env.local and the writes silently land on dev.
  // Refuse rather than shadow.
  const prodConvexWrites = entries.some(
    (e) => e.channel === "prod" && e.destinations.some((d) => d.type === "convex"),
  );
  if (prodConvexWrites) {
    const pf = sources.find((s) => s.channel === "prod");
    const deployKey = pf?.entries.get("CONVEX_DEPLOY_KEY") ?? "";
    const selector = pf?.entries.get("CONVEX_DEPLOYMENT") ?? "";
    if (!deployKey.startsWith("prod:") && !selector.startsWith("prod:")) {
      line();
      bad(`${pf?.path ?? "prod source"} has no prod-scoped CONVEX_DEPLOY_KEY or CONVEX_DEPLOYMENT`);
      note("prod env would silently write to the DEV deployment (the dev key shadows --prod)");
      note("add a `prod:` CONVEX_DEPLOY_KEY (or CONVEX_DEPLOYMENT) to the prod file and re-run");
      return 1;
    }
  }

  line();
  if (totalConflicts > 0) {
    note(
      `${totalConflicts} update${totalConflicts === 1 ? "" : "s"} will overwrite existing values (fingerprints shown above)`,
    );
  }

  let appliedTotal = 0;
  let failedTotal = 0;
  for (const plan of filePlans) {
    if (!options.force && process.stdin.isTTY) {
      line();
      const proceed = await askYesNo(`Apply ${plan.sourceFile} (${plan.channel})?`, true);
      if (!proceed) {
        nop(`skipped ${plan.sourceFile}`);
        continue;
      }
    }
    const { applied, failed } = await applyPlan(plan, { force: options.force });
    appliedTotal += applied;
    failedTotal += failed;
  }

  line();
  if (failedTotal > 0) {
    bad(`${appliedTotal} applied, ${failedTotal} failed`);
    return 1;
  }
  ok(`${appliedTotal} value${appliedTotal === 1 ? "" : "s"} synced`);

  await recordStep("accounts", {
    mode: "lite",
    syncedAt: new Date().toISOString(),
    sources: sources.map((s) => ({ path: s.path, channel: s.channel, keys: s.entries.size })),
    applied: appliedTotal,
  });

  if (!options.noVerify) {
    const haveProd = sources.some((s) => s.channel === "prod");
    const verifyChannels: Array<"dev" | "prod"> = haveProd ? ["dev", "prod"] : ["dev"];
    let totalFail = 0;
    let totalWarn = 0;
    for (const channel of verifyChannels) {
      section(`Verify (${channel})`);
      const ctx = await readContext(channel);
      const checks = await verifyAll(ctx);
      printVerifyResults(checks);
      const summary = summarize(checks);
      totalFail += summary.fail;
      totalWarn += summary.warn;
      line(
        `  ${GREEN}${summary.ok} ok${RESET}${summary.warn > 0 ? `, ${YELLOW}${summary.warn} warn${RESET}` : ""}${summary.fail > 0 ? `, ${RED}${summary.fail} fail${RESET}` : ""}${summary.skip > 0 ? `, ${DIM}${summary.skip} skip${RESET}` : ""}`,
      );
    }
    if (totalFail > 0) {
      line();
      bad(`${totalFail} verification failure${totalFail === 1 ? "" : "s"}`);
      note("re-run `vexpo doctor` for full output, or fix the env values and re-run");
      return 1;
    }
    if (options.strict && totalWarn > 0) {
      line();
      bad(`${totalWarn} warning${totalWarn === 1 ? "" : "s"} with --strict`);
      return 1;
    }
  }

  line();
  note("for full provisioning (Resend key, Apple JWT, signups), run `vexpo full`");
  return 0;
}

function printVerifyResults(checks: Check[]): void {
  const w = Math.max(...checks.map((c) => c.name.length));
  const order = ["files", "convex", "resend", "apple", "eas", "coherence"] as const;
  const grouped = new Map<string, Check[]>();
  for (const c of checks) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }
  for (const cat of order) {
    const items = grouped.get(cat);
    if (!items || items.length === 0) continue;
    line(`  ${BOLD}${cat}${RESET}`);
    for (const c of items) {
      const sym =
        c.severity === "ok"
          ? `${GREEN}✓${RESET}`
          : c.severity === "warn"
            ? `${YELLOW}⚠${RESET}`
            : c.severity === "fail"
              ? `${RED}✗${RESET}`
              : `${DIM}-${RESET}`;
      line(`    ${sym} ${c.name.padEnd(w)}  ${c.message}`);
      if (c.details) line(`        ${DIM}${c.details}${RESET}`);
    }
  }
}
