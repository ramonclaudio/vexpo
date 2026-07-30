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

// eas-cli says what went wrong on its first line and "<cmd> command failed." on
// its last, so a bare tail throws away the only sentence that helps. Being
// logged out is the case that costs the most: every env, project and
// integration call fails at once, and the tail blames each command in turn.
//
// Both streams get searched, because logged out is the case that splits them:
// with stdin ignored (which is how run() invokes everything) eas-cli puts the
// login prompt on stdout and keeps only the generic failure on stderr.
const NOT_SIGNED_IN = /An Expo user account is required|not logged in|Log in to EAS/i;

// One error-tail behavior everywhere: prefer stderr, fall back to stdout (some
// eas subcommands write their error there), then the bare exit code.
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
