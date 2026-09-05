#!/usr/bin/env node

import { spawn as nodeSpawn } from "node:child_process";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

function spawn(argv, opts = {}) {
  const stdio = opts.stdio ?? [
    opts.stdin ?? "inherit",
    opts.stdout ?? "inherit",
    opts.stderr ?? "inherit",
  ];
  const proc = nodeSpawn(argv[0], argv.slice(1), { stdio });
  let out = "";
  proc.stdout?.on("data", (c) => (out += c.toString()));
  return {
    stdout: new Promise((resolve) => {
      proc.on("close", () => resolve(out));
      proc.on("error", () => resolve(out));
    }),
    exited: new Promise((resolve) => {
      proc.on("close", (code) => resolve(code ?? 1));
      proc.on("error", () => resolve(127));
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pgrepF(pattern) {
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

async function trySignal(pids, signal) {
  if (pids.length === 0) return;
  await spawn(["kill", `-${signal}`, ...pids.map(String)], {
    stdio: ["ignore", "ignore", "ignore"],
  }).exited;
}

// Order matters: npm_execpath names the manager that ran us, and only when it
// says nothing do we fall back to whichever lockfile is on disk.
const LOCKFILES = {
  bun: "bun.lock",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  npm: "package-lock.json",
};

async function detectPackageManager() {
  const execpath = (process.env.npm_execpath ?? "").toLowerCase();
  for (const pm of Object.keys(LOCKFILES)) {
    if (execpath.includes(pm)) return pm;
  }
  for (const [pm, lock] of Object.entries(LOCKFILES)) {
    if (await pathExists(lock)) return pm;
  }
  return "npm";
}

function installCmdFor(pm, frozen) {
  if (!frozen) return `${pm} install`;
  if (pm === "npm") return "npm ci";
  return `${pm} install --frozen-lockfile`;
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(REPO);

// Everything here writes to stderr, so stderr decides. `NO_COLOR` is the
// cross-tool opt-out (any non-empty value), `TERM=dumb` is what a terminal that
// cannot handle escapes reports, and a pipe or a log file gets none either.
// That last one is what a screen reader or a braille display reads.
const colorEnabled =
  process.stderr.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const code = (seq) => (colorEnabled ? seq : "");

const RESET = code("\x1b[0m");
const BOLD = code("\x1b[1m");
const DIM = code("\x1b[2m");
function ansiHex(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return "";
  return code(`\x1b[38;2;${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}m`);
}
const GREEN = ansiHex("#22c55e");
const YELLOW = ansiHex("#f59e0b");
const RED = ansiHex("#ef4444");
const VIOLET = ansiHex("#a78bfa");

const line = (s = "") => process.stderr.write(s + "\n");
const ok = (msg) => line(`  ${GREEN}ok${RESET}   ${msg}`);
const nop = (msg) => line(`  ${DIM}--   ${msg}${RESET}`);
const yep = (msg) => line(`  ${YELLOW}!!${RESET}   ${msg}`);
const bad = (msg) => line(`  ${RED}xx${RESET}   ${RED}${msg}${RESET}`);

function stringWidth(s) {
  return [...s].length;
}

// The rule after the title is decoration, and seventy box-drawing dashes read
// back one at a time is noise. Without colour the title goes out alone.
function section(title) {
  if (!colorEnabled) {
    line(`\n${title}`);
    return;
  }
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
automatically before the wipe so a restarting bundler can't repopulate
caches mid-delete. ${BOLD}convex dev${RESET} is left alone (it's your data layer, not a
bundler); restart it manually if it misbehaves after a full wipe.
`;

let args;
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

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Every step below is one of two shapes: clear a single path if it is there, or
// gather a list of paths and clear that. These hold the common frame.
async function stepPath(title, path, { missing, done }) {
  section(title);
  if (!(await pathExists(path))) return nop(missing);
  await removePaths([path]);
  ok(done);
}

async function stepMatches(title, gather, { empty, one, many }) {
  section(title);
  const matches = await gather();
  if (matches.length === 0) return nop(empty);
  await removePaths(matches);
  ok(`removed ${plural(matches.length, one, many)}`);
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function removePaths(paths) {
  for (const p of paths) {
    await rm(p, { recursive: true, force: true });
  }
}

async function expandGlob(dir, pattern) {
  if (!(await pathExists(dir))) return [];
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  const entries = await readdir(dir);
  return entries.filter((e) => re.test(e)).map((e) => `${dir}/${e}`);
}

async function globAll(dir, patterns) {
  const matches = [];
  for (const pattern of patterns) matches.push(...(await expandGlob(dir, pattern)));
  return matches;
}

const TMPDIR = process.env.TMPDIR?.replace(/\/$/, "") ?? "/tmp";
const HOME = homedir();

async function readPkgName() {
  try {
    const pkg = JSON.parse(await readFile(`${REPO}/package.json`, "utf8"));
    if (typeof pkg === "object" && pkg !== null && "name" in pkg) {
      const { name } = pkg;
      if (typeof name === "string") return name;
    }
  } catch {}
  return basename(REPO);
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

const PROJECT_TARGETS_ALL = [
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "convex/_generated",
];

const PROJECT_GLOBS = ["bun-error.*", "*.log"];

const TMP_GLOBS = ["metro-*", "haste-map-*", "react-*", "node-compile-cache", "expo-*", "RN*"];

async function stepStopBundlers() {
  section("Stop bundlers");

  const targets = [
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

const stepMetroCachesOnly = () =>
  stepMatches(
    "Metro caches",
    () => globAll(TMPDIR, ["metro-*", "haste-map-*", "node-compile-cache"]),
    { empty: "nothing to wipe under $TMPDIR", one: "cache directory", many: "cache directories" },
  );

async function stepProjectArtifacts(all) {
  section("Project artifacts");
  const names = all ? [...PROJECT_TARGETS, ...PROJECT_TARGETS_ALL] : PROJECT_TARGETS;
  const targets = names.map((t) => `${REPO}/${t}`);
  for (const pattern of PROJECT_GLOBS) {
    targets.push(...(await expandGlob(REPO, pattern)));
  }
  const existing = [];
  for (const t of targets) {
    if (await pathExists(t)) existing.push(t);
  }
  if (existing.length === 0) {
    nop("nothing to wipe");
    return;
  }
  await removePaths(existing);
  for (const t of existing) ok(`removed ${t.replace(REPO + "/", "")}`);
}

// Not a stepMatches: an absent .eas/ and one holding only workflows/ are both
// empty lists, and the skip message should say which.
async function stepEasState() {
  section(".eas state");
  const easDir = `${REPO}/.eas`;
  if (!(await pathExists(easDir))) return nop(".eas/ not present");
  const entries = await readdir(easDir);
  const targets = entries.filter((name) => name !== "workflows").map((name) => `${easDir}/${name}`);
  if (targets.length === 0) return nop("only .eas/workflows/ present (kept)");
  await removePaths(targets);
  ok(`removed ${plural(targets.length, ".eas/ entry", ".eas/ entries")} (kept workflows/)`);
}

const stepDsStores = () =>
  stepMatches(
    "macOS .DS_Store",
    async () => {
      const stdout = await spawn(
        ["find", REPO, "-name", ".DS_Store", "-not", "-path", "*/node_modules/*"],
        { stdin: "ignore", stdout: "pipe", stderr: "ignore" },
      ).stdout;
      return stdout.split("\n").filter(Boolean);
    },
    { empty: "none found", one: ".DS_Store file", many: ".DS_Store files" },
  );

const stepTmpdirCaches = () =>
  stepMatches("$TMPDIR caches", () => globAll(TMPDIR, TMP_GLOBS), {
    empty: "nothing to wipe under $TMPDIR",
    one: "cache entry under $TMPDIR",
    many: "cache entries under $TMPDIR",
  });

const stepCocoaPodsCache = () =>
  stepPath("CocoaPods cache", `${HOME}/Library/Caches/CocoaPods`, {
    missing: "not present",
    done: "removed ~/Library/Caches/CocoaPods",
  });

const stepXcodeDerivedData = (pkgName) => {
  const root = `${HOME}/Library/Developer/Xcode/DerivedData`;
  return stepMatches(
    "Xcode DerivedData",
    async () => {
      if (!(await pathExists(root))) return [];
      const prefix = pkgName.toLowerCase();
      return (await readdir(root))
        .filter((e) => e.toLowerCase().startsWith(prefix))
        .map((e) => `${root}/${e}`);
    },
    {
      empty: "no matching DerivedData entries",
      one: "DerivedData entry",
      many: "DerivedData entries",
    },
  );
};

const stepExpoCache = () =>
  stepPath("Expo CLI cache", `${HOME}/.expo`, {
    missing: "~/.expo not present",
    done: "removed ~/.expo",
  });

const stepSetupState = () =>
  stepPath("Setup state", `${REPO}/.setup-state.json`, {
    missing: ".setup-state.json not present",
    done: "removed .setup-state.json (next `npx vexpo full` re-probes every phase)",
  });

async function stepInstall(pm) {
  section("Reinstall");
  const frozen = await pathExists(`${REPO}/${LOCKFILES[pm]}`);
  const cmd = installCmdFor(pm, frozen).split(" ");
  const proc = spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with code ${code}`);
  ok(cmd.join(" "));
}

async function stepConvexCodegen() {
  section("Convex codegen");
  if (await pathExists(`${REPO}/convex/_generated`)) {
    nop("convex/_generated/ present (skipped)");
    return;
  }
  const cmd = ["npx", "convex", "codegen"];
  const proc = spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
  const code = await proc.exited;
  if (code !== 0) {
    bad(`${cmd.join(" ")} exited with code ${code} (run it manually once Convex is reachable)`);
    return;
  }
  ok(cmd.join(" "));
}

const startedAt = performance.now();
try {
  if (args.metro) {
    await stepStopBundlers();
    await stepMetroCachesOnly();
  } else {
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
