import { dlx } from "./pkg-manager.ts";
import { run, spawn } from "./proc.ts";
import { errText } from "./output.ts";

const EAS_CLI = "eas-cli";

export type EasArgs = readonly (string | number | boolean | undefined | null)[];

function compact(argv: EasArgs): string[] {
  const out: string[] = [];
  for (const item of argv) {
    if (item === undefined || item === null || item === false) continue;
    if (item === true) continue;
    out.push(String(item));
  }
  return out;
}

const NOT_SIGNED_IN = /An Expo user account is required|not logged in|Log in to EAS/i;

function errorTail(code: number, stdout: string, stderr: string): string {
  if (NOT_SIGNED_IN.test(`${stderr}\n${stdout}`)) {
    return "not signed in to eas-cli. Run `npx eas-cli login`, or set EXPO_TOKEN to run headless";
  }
  return (stderr || stdout).trim().split("\n").pop()?.trim() ?? `exit ${code}`;
}

export async function easJson<T = unknown>(argv: EasArgs): Promise<T> {
  const flat = compact(argv);
  if (!flat.includes("--json")) flat.push("--json");
  if (!flat.includes("--non-interactive")) flat.push("--non-interactive");
  const { code, stdout, stderr } = await run([dlx(), EAS_CLI, ...flat]);
  if (code !== 0) throw new Error(`eas ${flat[0]} failed: ${errorTail(code, stdout, stderr)}`);
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`eas ${flat[0]} returned non-JSON output: ${errText(err)}`, { cause: err });
  }
}

export async function easRun(argv: EasArgs): Promise<void> {
  const flat = compact(argv);
  const { code, stdout, stderr } = await run([dlx(), EAS_CLI, ...flat]);
  if (code !== 0) throw new Error(`eas ${flat[0]} failed: ${errorTail(code, stdout, stderr)}`);
}

export async function easSpawn(
  argv: EasArgs,
  opts: { env?: Record<string, string | undefined>; cwd?: string } = {},
): Promise<number> {
  const flat = compact(argv);
  const proc = spawn([dlx(), EAS_CLI, ...flat], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: opts.env,
    cwd: opts.cwd,
  });
  return proc.exited;
}

export async function easText(
  argv: EasArgs,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const flat = compact(argv);
  return run([dlx(), EAS_CLI, ...flat]);
}
