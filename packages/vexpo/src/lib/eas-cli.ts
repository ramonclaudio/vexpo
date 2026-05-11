/**
 * Shared eas-cli helpers.
 *
 * Two patterns:
 *   - `easJson<T>(argv)`. runs eas with `--json --non-interactive`, parses
 *     stdout. Errors throw with the last stderr line as the message.
 *   - `easSpawn(argv)`. runs eas with stdio inherit (interactive). Returns
 *     the numeric exit code.
 *
 * Every domain wrapper (eas-build.ts, eas-update.ts, etc.) builds on these.
 */

import { dlx } from "./pkg-manager.ts";
import { run, spawn } from "./proc.ts";

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

/**
 * Run eas with JSON output. Appends `--json --non-interactive` if not already
 * present. Parses stdout as `T`. Throws on non-zero exit or invalid JSON.
 */
export async function easJson<T = unknown>(argv: EasArgs): Promise<T> {
  const flat = compact(argv);
  if (!flat.includes("--json")) flat.push("--json");
  if (!flat.includes("--non-interactive")) flat.push("--non-interactive");
  const { code, stdout, stderr } = await run([dlx(), "eas", ...flat]);
  if (code !== 0) {
    const tail = (stderr || stdout).trim().split("\n").pop()?.trim() ?? `exit ${code}`;
    throw new Error(`eas ${flat[0]} failed: ${tail}`);
  }
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(
      `eas ${flat[0]} returned non-JSON output: ${err instanceof Error ? err.message : err}`,
      { cause: err },
    );
  }
}

/**
 * Spawn eas with stdio inherit. Used for interactive commands (build, submit,
 * credentials wizard, etc.) and for any command where the user wants to see
 * the eas-cli output verbatim.
 */
export async function easSpawn(
  argv: EasArgs,
  opts: { env?: Record<string, string | undefined>; cwd?: string } = {},
): Promise<number> {
  const flat = compact(argv);
  const proc = spawn([dlx(), "eas", ...flat], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: opts.env,
    cwd: opts.cwd,
  });
  return proc.exited;
}

/**
 * Run eas non-interactively, capturing stdout + stderr. For commands that
 * don't support `--json` but need scripted invocation. Returns raw streams +
 * exit code; caller decides what to do with them.
 */
export async function easText(
  argv: EasArgs,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const flat = compact(argv);
  return run([dlx(), "eas", ...flat]);
}
