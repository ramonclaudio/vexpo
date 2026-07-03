/**
 * vexpo clean script.
 *
 * Never wiped (user data / secrets):
 * - .env / .env.* (auth values)
 * - .p8 / .p12 / AuthKey_* / SubscriptionKey_* (Apple keys)
 * - store.config.json (rebrand work; setup recreates from .example if missing)
 * - .vexpo-manual-setup/ / .rebrand-backup/
 * - .setup-state.json (opt-in via --state)
 *
 * Kept by default so reinstall is deterministic (opt in via --all):
 * - package-lock.json / bun.lock / yarn.lock (lockfile; `npm ci` or
 *   `<pm> install --frozen-lockfile` when present)
 * - convex/_generated/ (regenerated via `npx convex codegen` after --all)
 *
 * Uses macOS `trash` for every delete so anything wiped is recoverable.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

type StdioOption = "inherit" | "pipe" | "ignore";

type SpawnOpts = {
  stdio?: StdioOption[];
  stdin?: StdioOption;
  stdout?: StdioOption;
  stderr?: StdioOption;
};

function spawn(
  argv: readonly string[],
  opts: SpawnOpts = {},
): { exited: Promise<number>; stdout: Promise<string> } {
  const stdio = opts.stdio ?? [
    opts.stdin ?? "inherit",
    opts.stdout ?? "inherit",
    opts.stderr ?? "inherit",
  ];
  const proc = nodeSpawn(argv[0]!, argv.slice(1), { stdio });
  let out = "";
  proc.stdout?.on("data", (c) => (out += c.toString()));
  return {
    stdout: new Promise<string>((resolve) => {
      proc.on("close", () => resolve(out));
      proc.on("error", () => resolve(out));
    }),
    exited: new Promise<number>((resolve) => {
      proc.on("close", (code) => resolve(code ?? 1));
      // ENOENT (command not found) emits 'error' without 'close'. Treat as
      // the standard shell "not found" exit so callers can `if (code === 0)`.
      proc.on("error", () => resolve(127));
    }),
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Find PIDs whose full command line matches `pattern` (extended regex, via
 * `pgrep -f`). Excludes our own PID and PPID so the script never kills its
 * own bash parent or itself.
 */
async function pgrepF(pattern: string): Promise<number[]> {
  const buf = await spawn(["pgrep", "-f", pattern], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  }).stdout;
  const self = process.pid;
  const parent = typeof process.ppid === "number" ? process.ppid : -1;
  return buf
    .split("\n")
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n !== self && n !== parent);
}

async function trySignal(pids: readonly number[], signal: "TERM" | "KILL"): Promise<void> {
  if (pids.length === 0) return;
  await spawn(["kill", `-${signal}`, ...pids.map(String)], {
    stdio: ["ignore", "ignore", "ignore"],
  }).exited;
}

type PM = "bun" | "pnpm" | "yarn" | "npm";

// Capture which PM ran this script BEFORE any wipes: --all trashes the lockfile.
async function detectPackageManager(): Promise<PM> {
  const execpath = (process.env.npm_execpath ?? "").toLowerCase();
  if (execpath.includes("bun")) return "bun";
  if (execpath.includes("pnpm")) return "pnpm";
  if (execpath.includes("yarn")) return "yarn";
  if (execpath.includes("npm")) return "npm";
  if (await pathExists("bun.lock")) return "bun";
  if (await pathExists("pnpm-lock.yaml")) return "pnpm";
  if (await pathExists("yarn.lock")) return "yarn";
  return "npm";
}

function installCmdFor(pm: PM, frozen: boolean): string {
  if (!frozen) return `${pm} install`;
  // npm uses `ci` for frozen installs, every other PM has `--frozen-lockfile`.
  if (pm === "npm") return "npm ci";
  return `${pm} install --frozen-lockfile`;
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(REPO);

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
function ansiHex(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return "";
  return `\x1b[38;2;${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}m`;
}
const GREEN = ansiHex("#22c55e");
const YELLOW = ansiHex("#f59e0b");
const RED = ansiHex("#ef4444");
const VIOLET = ansiHex("#a78bfa");

const line = (s = "") => process.stderr.write(s + "\n");
const ok = (msg: string) => line(`  ${GREEN}ok${RESET}   ${msg}`);
const nop = (msg: string) => line(`  ${DIM}--   ${msg}${RESET}`);
const yep = (msg: string) => line(`  ${YELLOW}!!${RESET}   ${msg}`);
const bad = (msg: string) => line(`  ${RED}xx${RESET}   ${RED}${msg}${RESET}`);

function stringWidth(s: string): number {
  return [...s].length;
}

function section(title: string): void {
  const w = process.stderr.columns ?? process.stdout.columns ?? 80;
  const fill = "─".repeat(Math.max(0, w - stringWidth(title) - 3));
  line(`\n${BOLD}${VIOLET}${title}${RESET} ${DIM}${fill}${RESET}`);
}

const HELP = `${BOLD}vexpo clean${RESET}

${BOLD}Usage:${RESET}
  ${DIM}npm run clean${RESET}                wipe caches, keep lockfile, frozen install
  ${DIM}npm run clean --all${RESET}          also wipe lockfile + convex/_generated
  ${DIM}npm run clean --metro${RESET}        just Metro/Haste/node-compile caches
  ${DIM}npm run clean --state${RESET}        also wipe .setup-state.json
  ${DIM}npm run clean --no-install${RESET}   wipe everything but skip reinstall
  ${DIM}npm run clean --help${RESET}

The default wipe removes node_modules, ios/, .expo/, dist/,
tsbuildinfo, coverage/, .vitest-cache/, expo-env.d.ts, bun-error.*,
*.log, .eas/ (except workflows/), all .DS_Store files, $TMPDIR
Metro/Haste/React/expo/RN caches, ~/Library/Caches/CocoaPods, ~/.expo,
and the Xcode DerivedData subfolder for this project. The lockfile
and convex/_generated/ are kept so reinstall is deterministic
(${DIM}npm ci${RESET}). Never touches .env files,
Apple keys, store.config.json, .vexpo-manual-setup/, or .rebrand-backup/.

${BOLD}--all${RESET} additionally wipes the lockfile and convex/_generated/.
Reinstall resolves transitives fresh and ${DIM}npx convex codegen${RESET} runs
after install to rebuild the Convex bindings. Use when the lockfile
is suspect or you want a true clean-slate reinstall.

${BOLD}--state${RESET} additionally wipes .setup-state.json so the next
${DIM}npx vexpo full${RESET} re-probes every phase against external services
(slower, but the cure when state has drifted from reality).

Bundlers (Metro, expo CLI, react-native start, Watchman) are stopped
automatically before the wipe so macOS ${DIM}trash${RESET} can't silently skip files
held open. ${BOLD}convex dev${RESET} is left alone (it's your data layer, not a
bundler); restart it manually if it misbehaves after a full wipe.
`;

let args: {
  metro?: boolean;
  state?: boolean;
  all?: boolean;
  "no-install"?: boolean;
  help?: boolean;
};
try {
  args = parseArgs({
    args: process.argv.slice(2),
    options: {
      metro: { type: "boolean", default: false },
      state: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      "no-install": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  }).values;
} catch (err) {
  bad(err instanceof Error ? err.message : String(err));
  process.exit(2);
}

if (args.help) {
  line(HELP);
  process.exit(0);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pass paths to `trash` (recoverable). Skips paths that don't exist so the
 * macOS `trash` CLI doesn't error out on missing entries.
 */
async function trashPaths(paths: string[]): Promise<void> {
  const existing: string[] = [];
  for (const p of paths) {
    if (await pathExists(p)) existing.push(p);
  }
  if (existing.length === 0) return;
  const proc = spawn(["trash", ...existing], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}

async function expandGlob(dir: string, pattern: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  const entries = await readdir(dir);
  return entries.filter((e) => re.test(e)).map((e) => `${dir}/${e}`);
}

const TMPDIR = process.env.TMPDIR?.replace(/\/$/, "") ?? "/tmp";
const HOME = homedir();

async function readPkgName(): Promise<string> {
  try {
    const pkg: unknown = JSON.parse(await readFile(`${REPO}/package.json`, "utf8"));
    if (typeof pkg === "object" && pkg !== null && "name" in pkg) {
      const { name } = pkg;
      if (typeof name === "string") return name;
    }
  } catch {}
  return "vexpo";
}

const PROJECT_TARGETS = [
  "node_modules",
  "ios",
  ".expo",
  "dist",
  "tsconfig.tsbuildinfo",
  "coverage",
  ".vitest-cache",
  "expo-env.d.ts",
];

// Wiped only with --all. Default leaves these alone: the lockfile stays the
// source of truth (frozen install) and convex/_generated needs a deployment
// round-trip via `npx convex codegen` to come back.
const PROJECT_TARGETS_ALL = [
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "convex/_generated",
];

const PROJECT_GLOBS = ["bun-error.*", "*.log"];

const TMP_GLOBS = ["metro-*", "haste-map-*", "react-*", "node-compile-cache", "expo-*", "RN*"];

/**
 * Stop bundlers before wiping their caches. macOS `trash` silently skips
 * files held open by a running process, so caches survive the wipe and the
 * bundler restarts onto stale state. Killing first prevents that.
 */
async function stepStopBundlers(): Promise<void> {
  section("Stop bundlers");

  // Order: kill the parent CLI first so it can tear down its child Metro.
  const targets: { pattern: string; name: string }[] = [
    { pattern: "node .*\\.bin/expo (run:|start)", name: "expo CLI" },
    { pattern: "node .*@expo/cli/build/bin/cli", name: "expo CLI (forked)" },
    { pattern: "node .*metro/src/cli\\.js", name: "Metro" },
    { pattern: "node .*react-native start", name: "react-native start" },
  ];

  let killed = 0;
  for (const { pattern, name } of targets) {
    const pids = await pgrepF(pattern);
    if (pids.length === 0) continue;
    await trySignal(pids, "TERM");
    ok(`stopped ${name} (${pids.length} ${pids.length === 1 ? "process" : "processes"})`);
    killed += pids.length;
  }

  const wm = await spawn(["watchman", "shutdown-server"], {
    stdio: ["ignore", "ignore", "ignore"],
  }).exited;
  if (wm === 0) {
    ok("stopped Watchman");
    killed += 1;
  }

  if (killed === 0) {
    nop("no bundlers running");
  } else {
    // Drain SIGTERM, then SIGKILL stragglers so the wipe can't race them.
    await sleep(500);
    for (const { pattern } of targets) {
      const pids = await pgrepF(pattern);
      if (pids.length > 0) await trySignal(pids, "KILL");
    }
  }

  const convex = await pgrepF("\\.bin/convex dev");
  if (convex.length > 0) {
    yep("convex dev is still running. Restart it after the wipe if it misbehaves.");
  }
}

async function stepMetroCachesOnly(): Promise<void> {
  section("Metro caches");
  const matches: string[] = [];
  for (const pattern of ["metro-*", "haste-map-*", "node-compile-cache"]) {
    matches.push(...(await expandGlob(TMPDIR, pattern)));
  }
  if (matches.length === 0) {
    nop("nothing to wipe under $TMPDIR");
    return;
  }
  await trashPaths(matches);
  ok(`trashed ${matches.length} cache director${matches.length === 1 ? "y" : "ies"}`);
}

async function stepProjectArtifacts(all: boolean): Promise<void> {
  section("Project artifacts");
  const names = all ? [...PROJECT_TARGETS, ...PROJECT_TARGETS_ALL] : PROJECT_TARGETS;
  const targets = names.map((t) => `${REPO}/${t}`);
  for (const pattern of PROJECT_GLOBS) {
    targets.push(...(await expandGlob(REPO, pattern)));
  }
  const existing: string[] = [];
  for (const t of targets) {
    if (await pathExists(t)) existing.push(t);
  }
  if (existing.length === 0) {
    nop("nothing to wipe");
    return;
  }
  await trashPaths(existing);
  for (const t of existing) ok(`trashed ${t.replace(REPO + "/", "")}`);
}

/**
 * Wipe `.eas/` per-project CLI state but keep `.eas/workflows/` (tracked YAML).
 * EAS regenerates everything else on its next invocation.
 */
async function stepEasState(): Promise<void> {
  section(".eas state");
  const easDir = `${REPO}/.eas`;
  if (!(await pathExists(easDir))) {
    nop(".eas/ not present");
    return;
  }
  const entries = await readdir(easDir);
  const targets = entries.filter((name) => name !== "workflows").map((name) => `${easDir}/${name}`);
  if (targets.length === 0) {
    nop("only .eas/workflows/ present (kept)");
    return;
  }
  await trashPaths(targets);
  ok(
    `trashed ${targets.length} .eas/ ${targets.length === 1 ? "entry" : "entries"} (kept workflows/)`,
  );
}

async function stepDsStores(): Promise<void> {
  section("macOS .DS_Store");
  const stdout = await spawn(
    ["find", REPO, "-name", ".DS_Store", "-not", "-path", "*/node_modules/*"],
    { stdin: "ignore", stdout: "pipe", stderr: "ignore" },
  ).stdout;
  const matches = stdout.split("\n").filter(Boolean);
  if (matches.length === 0) {
    nop("none found");
    return;
  }
  await trashPaths(matches);
  ok(`trashed ${matches.length} .DS_Store ${matches.length === 1 ? "file" : "files"}`);
}

async function stepTmpdirCaches(): Promise<void> {
  section("$TMPDIR caches");
  const matches: string[] = [];
  for (const pattern of TMP_GLOBS) {
    matches.push(...(await expandGlob(TMPDIR, pattern)));
  }
  if (matches.length === 0) {
    nop("nothing to wipe under $TMPDIR");
    return;
  }
  await trashPaths(matches);
  ok(`trashed ${matches.length} cache entr${matches.length === 1 ? "y" : "ies"} under $TMPDIR`);
}

async function stepCocoaPodsCache(): Promise<void> {
  section("CocoaPods cache");
  const path = `${HOME}/Library/Caches/CocoaPods`;
  if (!(await pathExists(path))) {
    nop("not present");
    return;
  }
  await trashPaths([path]);
  ok("trashed ~/Library/Caches/CocoaPods");
}

async function stepXcodeDerivedData(pkgName: string): Promise<void> {
  section("Xcode DerivedData");
  const root = `${HOME}/Library/Developer/Xcode/DerivedData`;
  if (!(await pathExists(root))) {
    nop("DerivedData not present");
    return;
  }
  // Match folders that start with the project's pkg name OR the iOS
  // bundle's display name. We filter by leading prefix so we never touch
  // other projects' caches.
  const matches = [
    ...(await expandGlob(root, `${pkgName}-*`)),
    ...(await expandGlob(root, "Vexpo-*")),
  ];
  if (matches.length === 0) {
    nop("no matching DerivedData entries");
    return;
  }
  await trashPaths(matches);
  ok(`trashed ${matches.length} DerivedData ${matches.length === 1 ? "entry" : "entries"}`);
}

async function stepExpoCache(): Promise<void> {
  section("Expo CLI cache");
  const path = `${HOME}/.expo`;
  if (!(await pathExists(path))) {
    nop("~/.expo not present");
    return;
  }
  await trashPaths([path]);
  ok("trashed ~/.expo");
}

async function stepSetupState(): Promise<void> {
  section("Setup state");
  const path = `${REPO}/.setup-state.json`;
  if (!(await pathExists(path))) {
    nop(".setup-state.json not present");
    return;
  }
  await trashPaths([path]);
  ok("trashed .setup-state.json (next `npx vexpo full` re-probes every phase)");
}

async function stepInstall(pm: PM): Promise<void> {
  section("Reinstall");
  // Frozen install when a lockfile is on disk: deterministic, no transitive drift.
  // After --all the lockfile is gone and bun resolves fresh.
  const frozen = await pathExists(`${REPO}/${lockfileFor(pm)}`);
  const cmd = installCmdFor(pm, frozen).split(" ");
  const proc = spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with code ${code}`);
  ok(cmd.join(" "));
}

function lockfileFor(pm: PM): string {
  if (pm === "bun") return "bun.lock";
  if (pm === "pnpm") return "pnpm-lock.yaml";
  if (pm === "yarn") return "yarn.lock";
  return "package-lock.json";
}

async function stepConvexCodegen(): Promise<void> {
  section("Convex codegen");
  if (await pathExists(`${REPO}/convex/_generated`)) {
    nop("convex/_generated/ present (skipped)");
    return;
  }
  // No bun.lock or convex/_generated on disk after --all. `convex codegen`
  // talks to the deployment to rebuild the TypeScript bindings; skip and warn
  // if the env isn't wired so this never blocks a clean.
  const cmd = ["npx", "convex", "codegen"];
  const proc = spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
  const code = await proc.exited;
  if (code !== 0) {
    bad(`${cmd.join(" ")} exited with code ${code} (run it manually once Convex is reachable)`);
    return;
  }
  ok(cmd.join(" "));
}

// Wrapped in an async IIFE so the file works under both ESM (top-level await
// supported) and CJS-via-tsx (no top-level await).
void (async () => {
  const startedAt = performance.now();
  try {
    if (args.metro) {
      await stepStopBundlers();
      await stepMetroCachesOnly();
    } else {
      // Capture PM BEFORE any wipes; --all trashes the lockfile.
      const pm = await detectPackageManager();
      const pkgName = await readPkgName();
      const all = args.all === true;
      await stepStopBundlers();
      await stepProjectArtifacts(all);
      await stepEasState();
      await stepDsStores();
      await stepTmpdirCaches();
      await stepCocoaPodsCache();
      await stepXcodeDerivedData(pkgName);
      await stepExpoCache();
      if (args.state) await stepSetupState();
      if (!args["no-install"]) {
        await stepInstall(pm);
        if (all) await stepConvexCodegen();
      } else {
        yep(`--no-install passed; skipping ${pm} install`);
      }
    }
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(2);
    line(`\n  ${GREEN}ok${RESET}   clean complete in ${elapsed}s\n`);
  } catch (err) {
    line();
    if (err instanceof Error) bad(err.message);
    else bad(String(err));
    process.exit(1);
  }
})();
