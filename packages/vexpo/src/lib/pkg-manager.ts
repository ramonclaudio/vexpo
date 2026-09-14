import { fileExists } from "./fs.ts";

export async function detectPackageManager(): Promise<"bun" | "pnpm" | "yarn" | "npm"> {
  if (await fileExists("bun.lock")) return "bun";
  if (await fileExists("bun.lockb")) return "bun";
  if (await fileExists("pnpm-lock.yaml")) return "pnpm";
  if (await fileExists("yarn.lock")) return "yarn";
  return "npm";
}

export function dlx(): string {
  return process.versions.bun ? "bunx" : "npx";
}
