import { dlx } from "./pkg-manager.ts";
import { run, spawn } from "./proc.ts";

// npx/bunx resolve packages by name. The `eas` binary lives in the `eas-cli`
// package, so bare `npx eas` fails with "could not determine executable to run"
// unless eas-cli happens to be globally installed. Invoke the package name.
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

// One error-tail behavior everywhere: prefer stderr, fall back to stdout (some
// eas subcommands write their error there), then the bare exit code.
function errorTail(code: number, stdout: string, stderr: string): string {
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
    throw new Error(
      `eas ${flat[0]} returned non-JSON output: ${err instanceof Error ? err.message : err}`,
      { cause: err },
    );
  }
}

// Run an eas subcommand that returns no JSON, throwing a uniform tail on nonzero.
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
