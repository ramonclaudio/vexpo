import { readFile } from "node:fs/promises";

import { readOne } from "./env-local.ts";
import { fileExists } from "./fs.ts";
import { dlx } from "./pkg-manager.ts";
import { run, spawn } from "./proc.ts";
import { errText } from "./output.ts";

const EAS_CLI = "eas-cli";

const nonEmpty = (value: string | undefined): string | null =>
  value && value.length > 0 ? value : null;

async function projectIdFromAppJson(): Promise<string | null> {
  if (!(await fileExists("app.json"))) return null;
  const json = JSON.parse(await readFile("app.json", "utf8")) as {
    expo?: { extra?: { eas?: { projectId?: string } } };
  };
  return nonEmpty(json.expo?.extra?.eas?.projectId);
}

export async function resolveProjectId(): Promise<string | null> {
  const found =
    (await projectIdFromAppJson()) ??
    nonEmpty(process.env.EAS_PROJECT_ID) ??
    nonEmpty(await readOne("EAS_PROJECT_ID"));
  if (found) process.env.EAS_PROJECT_ID = found;
  return found;
}

// `eas init` writes the project id into app.json and eas-cli reads it from there. A project
// linked through EAS_PROJECT_ID in .env.local instead has no such link, because eas-cli does not
// read that file, so resolve it into the environment before every call.
let resolved: Promise<string | null> | undefined;
const ensureProjectId = (): Promise<string | null> => (resolved ??= resolveProjectId());

const NOT_SIGNED_IN = /An Expo user account is required|not logged in|Log in to EAS/i;

function errorTail(code: number, stdout: string, stderr: string): string {
  if (NOT_SIGNED_IN.test(`${stderr}\n${stdout}`)) {
    return "not signed in to EAS. Run `npx eas-cli login`, or set EXPO_TOKEN in CI";
  }
  return (stderr || stdout).trim().split("\n").pop()?.trim() ?? `exit ${code}`;
}

export async function easJson<T = unknown>(argv: readonly string[]): Promise<T> {
  const flat = [...argv];
  if (!flat.includes("--json")) flat.push("--json");
  if (!flat.includes("--non-interactive")) flat.push("--non-interactive");
  await ensureProjectId();
  const { code, stdout, stderr } = await run([dlx(), EAS_CLI, ...flat]);
  if (code !== 0) throw new Error(`eas ${flat[0]} failed: ${errorTail(code, stdout, stderr)}`);
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`eas ${flat[0]} returned non-JSON output: ${errText(err)}`, { cause: err });
  }
}

export async function easRun(argv: readonly string[]): Promise<void> {
  await ensureProjectId();
  const { code, stdout, stderr } = await run([dlx(), EAS_CLI, ...argv]);
  if (code !== 0) throw new Error(`eas ${argv[0]} failed: ${errorTail(code, stdout, stderr)}`);
}

export async function easSpawn(
  argv: readonly string[],
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<number> {
  await ensureProjectId();
  const proc = spawn([dlx(), EAS_CLI, ...argv], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: opts.env,
  });
  return proc.exited;
}

export async function easText(
  argv: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  await ensureProjectId();
  return run([dlx(), EAS_CLI, ...argv]);
}
