#!/usr/bin/env node
/**
 * Runtime-agnostic launcher for vexpo's TypeScript setup scripts.
 *
 * Picks the first available runtime that handles full TypeScript syntax:
 *
 *   1. bun. native TS, fastest startup
 *   2. tsx (devDep). esbuild-based TS runner, works under any node 18+
 *
 * Note: we don't use node's `--experimental-strip-types` because it's
 * strip-only. it doesn't transform syntax (parameter properties, enums,
 * namespaces, etc all error out). bun and tsx handle full TS.
 *
 * Then re-execs the target script with the selected runtime, forwarding
 * argv and stdio. Exit code mirrors the child.
 *
 * Usage (from package.json scripts):
 *   node scripts/_run.mjs scripts/setup.ts [args...]
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const [, , target, ...rawRest] = process.argv;
if (!target) {
  console.error("usage: _run.mjs <script.ts> [args...]");
  process.exit(2);
}

// pnpm passes a literal `--` separator before forwarded args. npm and yarn
// strip it. Drop a leading `--` so all PMs behave the same.
const rest = rawRest[0] === "--" ? rawRest.slice(1) : rawRest;

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return r.stdout.trim().split("\n")[0] || null;
}

function pickRuntime() {
  // Already running under bun? Use it directly (fastest).
  if (process.versions.bun) return { cmd: process.execPath, args: [target] };

  // bun on PATH
  const bun = which("bun");
  if (bun) return { cmd: bun, args: [target] };

  // tsx fallback (any node 18+)
  const tsx = resolve(REPO, "node_modules", ".bin", "tsx");
  if (existsSync(tsx)) return { cmd: tsx, args: [target] };

  // tsx via npx as last resort
  const npx = which("npx");
  if (npx) return { cmd: npx, args: ["tsx", target] };

  console.error(`vexpo full needs bun or tsx to run TypeScript.`);
  console.error(`  install bun:  curl -fsSL https://bun.sh/install | bash`);
  console.error(`  or run:       npm install   (vexpo ships tsx as a devDep)`);
  process.exit(1);
}

const runtime = pickRuntime();
const child = spawn(runtime.cmd, [...runtime.args, ...rest], {
  stdio: "inherit",
  cwd: REPO,
});
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
