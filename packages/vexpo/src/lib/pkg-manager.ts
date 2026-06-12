/**
 * Detect the package manager (for user-facing instructions) and the
 * runtime (for our own subprocess invocations). Two independent concerns:
 *
 * - Runtime: what's actually executing this script. `bunx` is only safe
 *   to invoke when running under bun. Otherwise use `npx` (universally
 *   available with any node install). This dictates `dlx()`.
 *
 * - Package manager: what the user runs for project deps. Detected from
 *   lockfile presence (bun.lock / pnpm-lock.yaml / yarn.lock /
 *   package-lock.json). Used in printed instructions like "run
 *   `<pm> install`".
 */

import { access } from "node:fs/promises";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(): Promise<PackageManager> {
  if (await fileExists("bun.lock")) return "bun";
  if (await fileExists("bun.lockb")) return "bun";
  if (await fileExists("pnpm-lock.yaml")) return "pnpm";
  if (await fileExists("yarn.lock")) return "yarn";
  return "npm";
}

export function dlx(): string {
  return process.versions.bun ? "bunx" : "npx";
}

export function installCmdFor(pm: PackageManager): string {
  switch (pm) {
    case "bun":
      return "bun install";
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "npm":
    default:
      return "npm install";
  }
}

export function currentRuntime(): "bun" | "node" {
  return process.versions.bun ? "bun" : "node";
}

export function currentRuntimeVersion(): string {
  return process.versions.bun ?? process.versions.node ?? "?";
}
