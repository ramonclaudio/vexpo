import { dlx } from "./pkg-manager.ts";
import { run, spawn } from "./proc.ts";
import { errText } from "./output.ts";

const EAS_CLI = "eas-cli";

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
  const { code, stdout, stderr } = await run([dlx(), EAS_CLI, ...flat]);
  if (code !== 0) throw new Error(`eas ${flat[0]} failed: ${errorTail(code, stdout, stderr)}`);
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`eas ${flat[0]} returned non-JSON output: ${errText(err)}`, { cause: err });
  }
}

export async function easRun(argv: readonly string[]): Promise<void> {
  const { code, stdout, stderr } = await run([dlx(), EAS_CLI, ...argv]);
  if (code !== 0) throw new Error(`eas ${argv[0]} failed: ${errorTail(code, stdout, stderr)}`);
}

export async function easSpawn(
  argv: readonly string[],
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<number> {
  const proc = spawn([dlx(), EAS_CLI, ...argv], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: opts.env,
  });
  return proc.exited;
}

export function easText(
  argv: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return run([dlx(), EAS_CLI, ...argv]);
}
