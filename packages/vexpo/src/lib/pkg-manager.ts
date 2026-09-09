import { fileExists } from "./fs.ts";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

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
  return `${pm} install`;
}

export function currentRuntime(): "bun" | "node" {
  return process.versions.bun ? "bun" : "node";
}

export function currentRuntimeVersion(): string {
  return process.versions.bun ?? process.versions.node ?? "?";
}
