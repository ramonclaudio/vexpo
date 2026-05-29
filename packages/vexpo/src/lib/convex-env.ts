import { access } from "node:fs/promises";

import { dlx } from "./pkg-manager.ts";
import { run } from "./proc.ts";

export type ConvexTarget = { prod?: boolean; deployment?: string; envFile?: string };

function deploymentName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(?:dev|prod|preview):(.+)$/.exec(value);
  return m ? m[1] : value;
}

function targetArgs(target?: ConvexTarget): string[] {
  if (target?.prod) {
    // A dev CONVEX_DEPLOY_KEY in .env.local shadows `--prod`: the Convex CLI
    // uses the key's (dev) deployment and silently ignores --prod, so prod env
    // ops land on the dev deployment. When the caller knows the prod source
    // file, point the CLI at it (`--env-file`) so it reads the prod
    // CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY from there instead of .env.local.
    return target.envFile ? ["--env-file", target.envFile] : ["--prod"];
  }
  const explicit = target?.deployment ?? deploymentName(process.env.CONVEX_DEPLOYMENT);
  return explicit ? ["--deployment", explicit] : [];
}

export async function envMap(target?: ConvexTarget): Promise<Map<string, string>> {
  const argv = [dlx(), "convex", "env", "list", ...targetArgs(target)];
  const { code, stdout } = await run(argv);
  const out = new Map<string, string>();
  if (code !== 0) return out;
  for (const raw of stdout.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) out.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return out;
}

export async function envSet(name: string, value: string, target?: ConvexTarget): Promise<void> {
  const argv = [dlx(), "convex", "env", "set", ...targetArgs(target), name, value];
  const { code, stderr } = await run(argv);
  if (code === 0) return;
  const tail = stderr.trim().split("\n").pop()?.trim() ?? `exit ${code}`;
  throw new Error(`convex env set ${name} failed: ${tail}`);
}

export async function envRemove(name: string, target?: ConvexTarget): Promise<void> {
  const argv = [dlx(), "convex", "env", "remove", ...targetArgs(target), name];
  await run(argv);
}

/**
 * Set every var in a `.env`-format file in one shot via `convex env set --from-file`.
 * Single call instead of looping per-key. The CLI handles the upsert semantics.
 * Pass `force: true` to overwrite existing values (Convex CLI requires --force on overwrite).
 */
export async function envSetFromFile(
  filePath: string,
  target?: ConvexTarget,
  opts?: { force?: boolean },
): Promise<void> {
  const argv = [
    dlx(),
    "convex",
    "env",
    "set",
    "--from-file",
    filePath,
    ...targetArgs(target),
    ...(opts?.force ? ["--force"] : []),
  ];
  const { code, stderr } = await run(argv);
  if (code !== 0) {
    const tail = stderr.trim().split("\n").pop()?.trim() ?? `exit ${code}`;
    throw new Error(`convex env set --from-file failed: ${tail}`);
  }
}

export async function version(): Promise<string | null> {
  const { code, stdout } = await run([dlx(), "convex", "--version"]);
  if (code !== 0) return null;
  return stdout.trim();
}

export async function isLoggedIn(): Promise<boolean> {
  const home = process.env.HOME;
  if (!home) return false;
  try {
    await access(`${home}/.convex/config.json`);
    return true;
  } catch {
    return false;
  }
}

export function deploymentSlug(value: string | undefined): string | undefined {
  return deploymentName(value);
}
