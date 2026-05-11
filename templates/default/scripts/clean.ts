/**
 * vexpo clean script.
 *
 * Wipes every regenerable cache and build artifact:
 * - Project artifacts: node_modules, bun.lock, ios/, .expo/, dist/, convex/_generated/, tsconfig.tsbuildinfo, coverage/, .vitest-cache/, expo-env.d.ts, bun-error.*, *.log
 * - .eas/ per-project state (keeps .eas/workflows/)
 * - .DS_Store files repo-wide
 * - $TMPDIR caches: metro-*, haste-map-*, react-*, node-compile-cache, expo-*, RN*
 * - System caches: ~/Library/Caches/CocoaPods, ~/.expo
 * - Xcode build outputs: ~/Library/Developer/Xcode/DerivedData/<project>-*
 *
 * Never wiped (user data / secrets):
 * - .env / .env.* (auth values)
 * - .p8 / .p12 / AuthKey_* / SubscriptionKey_* (Apple keys)
 * - store.config.json (rebrand work; setup recreates from .example if missing)
 * - .vexpo-manual-setup/ / .rebrand-backup/
 * - .setup-state.json (opt-in via --state)
 *
 * Then reinstalls deps via the detected package manager.
 *
 * Uses macOS `trash` for every delete so anything wiped is recoverable.
 *
 * Usage:
 *   bun run clean                full wipe + install
 *   bun run clean --metro        just Metro/Haste/Babel caches (fast, no reinstall)
 *   bun run clean --state        also wipe .setup-state.json (next setup re-probes everything)
 *   bun run clean --no-install   wipe everything but skip the reinstall
 *   bun run clean --help
 */

import { spawn as nodeSpawn } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
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

function spawn(argv: readonly string[], opts: SpawnOpts = {}): { exited: Promise<number> } {
  const stdio = opts.stdio ?? [
    opts.stdin ?? "inherit",
    opts.stdout ?? "inherit",
    opts.stderr ?? "inherit",
  ];
  const proc = nodeSpawn(argv[0]!, argv.slice(1), { stdio });
  return {
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
  return new Promise((resolve) => {
    const proc = nodeSpawn("pgrep", ["-f", pattern], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let buf = "";
    proc.stdout?.on("data", (c) => (buf += c.toString()));
    proc.on("error", () => resolve([]));
    proc.on("close", () => {
      const self = process.pid;
      const parent = typeof process.ppid === "number" ? process.ppid : -1;
      const pids = buf
        .split("\n")
        .filter(Boolean)
        .map((s) => Number.parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n !== self && n !== parent);
      resolve(pids);
    });
  });
}

async function trySignal(pids: readonly number[], signal: "TERM" | "KILL"): Promise<void> {
  if (pids.length === 0) return;
  await spawn(["kill", `-${signal}`, ...pids.map(String)], {
    stdio: ["ignore", "ignore", "ignore"],
  }).exited;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

type PM = "bun" | "pnpm" | "yarn" | "npm";

/**
 * Capture which PM ran this script BEFORE any wipes. Two signals:
 * 1. `npm_execpath`. every modern PM (npm/bun/pnpm/yarn) sets this to its
 *    own binary path when running scripts. Most reliable.
 * 2. Lockfile presence. fallback when running outside `<pm> run` (e.g.
 *    direct `node scripts/clean.ts`). Read while the lockfile still exists.
 */
async function detectPackageManager(): Promise<PM> {
  const execpath = (process.env.npm_execpath ?? "").toLowerCase();
  if (execpath.includes("bun")) return "bun";
  if (execpath.includes("pnpm")) return "pnpm";
  if (execpath.includes("yarn")) return "yarn";
  if (execpath.includes("npm")) return "npm";
  if (await fileExists("bun.lock")) return "bun";
  if (await fileExists("pnpm-lock.yaml")) return "pnpm";
  if (await fileExists("yarn.lock")) return "yarn";
  return "npm";
}

function installCmdFor(pm: PM): string {
  return `${pm} install`;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(REPO_ROOT);

// ─── Output ──────────────────────────────────────────────────────────────────

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

// ─── Args ────────────────────────────────────────────────────────────────────

const HELP = `${BOLD}vexpo clean${RESET}

${BOLD}Usage:${RESET}
  ${DIM}bun run clean${RESET}                full wipe + bun install
  ${DIM}bun run clean --metro${RESET}        just Metro/Haste/Babel caches
  ${DIM}bun run clean --state${RESET}        also wipe .setup-state.json
  ${DIM}bun run clean --no-install${RESET}   wipe everything but skip reinstall
  ${DIM}bun run clean --help${RESET}

The full wipe removes node_modules, lockfile, ios/, .expo/, dist/,
convex/_generated/, tsbuildinfo, coverage/, .vitest-cache/,
expo-env.d.ts, bun-error.*, *.log, .eas/ (except workflows/),
all .DS_Store files, $TMPDIR Metro/Haste/React/expo/RN caches,
~/Library/Caches/CocoaPods, ~/.expo, and the Xcode DerivedData
subfolder for this project. Never touches .env files, Apple keys,
store.config.json, .vexpo-manual-setup/, or .rebrand-backup/.

${BOLD}--state${RESET} additionally wipes .setup-state.json so the next
${DIM}bun run setup${RESET} re-probes every phase against external services
(slower, but the cure when state has drifted from reality).

Bundlers (Metro, expo CLI, react-native start, Watchman) are stopped
automatically before the wipe so macOS ${DIM}trash${RESET} can't silently skip files
held open. ${BOLD}convex dev${RESET} is left alone (it's your data layer, not a
bundler); restart it manually if it misbehaves after a full wipe.
`;

let args: { metro?: boolean; state?: boolean; "no-install"?: boolean; help?: boolean };
try {
  args = parseArgs({
    args: process.argv.slice(2),
    options: {
      metro: { type: "boolean", default: false },
      state: { type: "boolean", default: false },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  // Convert simple glob (only * supported) to regex. Sufficient for our patterns.
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  const entries = await readdir(dir);
  return entries.filter((e) => re.test(e)).map((e) => `${dir}/${e}`);
}

// ─── Targets ─────────────────────────────────────────────────────────────────

const REPO = REPO_ROOT;
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
  "bun.lock",
  "ios",
  ".expo",
  "dist",
  "convex/_generated",
  "tsconfig.tsbuildinfo",
  "coverage",
  ".vitest-cache",
  "expo-env.d.ts",
];

// Globs evaluated at REPO root. bun-error.* and *.log are cheap to wipe and
// almost never wanted across runs.
const PROJECT_GLOBS = ["bun-error.*", "*.log"];

const TMP_GLOBS = ["metro-*", "haste-map-*", "react-*", "node-compile-cache", "expo-*", "RN*"];

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * Stop bundlers before wiping their caches. macOS `trash` silently skips
 * files held open by a running process, so caches survive the wipe and the
 * bundler restarts onto stale state. Killing first prevents that.
 *
 * Bundlers are killed automatically. `convex dev` is the user's data layer,
 * not a bundler. left alone, with a warning.
 */
async function stepStopBundlers(): Promise<void> {
  section("Stop bundlers");

  // Patterns are pgrep -f extended regex over the full command line.
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

  // Watchman has its own clean shutdown. No-op if not installed (exit 127).
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

async function stepProjectArtifacts(): Promise<void> {
  section("Project artifacts");
  const targets = PROJECT_TARGETS.map((t) => `${REPO}/${t}`);
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
  const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
    const proc = nodeSpawn(
      "find",
      [REPO, "-name", ".DS_Store", "-not", "-path", "*/node_modules/*"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let buf = "";
    proc.stdout?.on("data", (c) => (buf += c.toString()));
    proc.on("close", () => resolve({ stdout: buf }));
  });
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
  // .expo holds the user-level Expo cache (devices.json, telemetry, sdk
  // metadata). Safe to wipe; Expo regenerates on next CLI invocation.
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
  ok("trashed .setup-state.json (next `bun run setup` re-probes every phase)");
}

async function stepInstall(pm: PM): Promise<void> {
  section("Reinstall");
  const cmd = installCmdFor(pm).split(" ");
  const proc = spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with code ${code}`);
  ok(cmd.join(" "));
}

// ─── Entry ───────────────────────────────────────────────────────────────────

// Wrapped in an async IIFE so the file works under both ESM (top-level await
// supported) and CJS-via-tsx (no top-level await).
void (async () => {
  const startedAt = performance.now();
  try {
    if (args.metro) {
      await stepStopBundlers();
      await stepMetroCachesOnly();
    } else {
      // Capture PM BEFORE any wipes; stepProjectArtifacts trashes the lockfile.
      const pm = await detectPackageManager();
      const pkgName = await readPkgName();
      await stepStopBundlers();
      await stepProjectArtifacts();
      await stepEasState();
      await stepDsStores();
      await stepTmpdirCaches();
      await stepCocoaPodsCache();
      await stepXcodeDerivedData(pkgName);
      await stepExpoCache();
      if (args.state) await stepSetupState();
      if (!args["no-install"]) {
        await stepInstall(pm);
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
