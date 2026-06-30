import { readFile, writeFile } from "node:fs/promises";

import { readEnvFile } from "./env-files.ts";
import { fileExists } from "./fs.ts";
import { bad } from "./output.ts";

export const ENV_FILE = ".env.local";

export function readAll(): Promise<Map<string, string>> {
  return readEnvFile(ENV_FILE);
}

export async function readOne(key: string): Promise<string | undefined> {
  return (await readAll()).get(key);
}

// Bundle id is the prerequisite for every Apple/EAS step. `vexpo convex` writes
// it; if it's missing the user skipped that step, so bail with the pointer.
export async function requireBundleId(): Promise<string | undefined> {
  const bundleId = await readOne("EXPO_PUBLIC_APP_BUNDLE_ID");
  if (bundleId) return bundleId;
  bad("no EXPO_PUBLIC_APP_BUNDLE_ID in .env.local. Run `vexpo convex` first.");
  return undefined;
}

export async function ensureLine(key: string, value: string): Promise<void> {
  const current = (await fileExists(ENV_FILE)) ? await readFile(ENV_FILE, "utf8") : "";
  if (new RegExp(`^${key}=`, "m").test(current)) return;
  const needsNewline = current !== "" && !current.endsWith("\n");
  await writeFile(ENV_FILE, `${current}${needsNewline ? "\n" : ""}${key}=${value}\n`);
}

export async function removeLines(keys: readonly string[]): Promise<void> {
  if (!(await fileExists(ENV_FILE))) return;
  const text = await readFile(ENV_FILE, "utf8");
  const drop = new Set(keys);
  const next = text
    .split("\n")
    .filter((l) => {
      const eq = l.indexOf("=");
      if (eq <= 0) return true;
      return !drop.has(l.slice(0, eq).trim());
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  await writeFile(ENV_FILE, next);
}
