#!/usr/bin/env node
/**
 * We don't use node's `--experimental-strip-types` because it's strip-only.
 * It doesn't transform syntax (parameter properties, enums, namespaces, etc
 * all error out). bun and tsx handle full TS.
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
  if (process.versions.bun) return { cmd: process.execPath, args: [target] };

  const bun = which("bun");
  if (bun) return { cmd: bun, args: [target] };

  const tsx = resolve(REPO, "node_modules", ".bin", "tsx");
  if (existsSync(tsx)) return { cmd: tsx, args: [target] };

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
