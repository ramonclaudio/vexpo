import { access } from "node:fs/promises";

import { parseKeyValueLines, withTempEnvFile } from "./env-files.ts";
import { dlx } from "./pkg-manager.ts";
import { run } from "./proc.ts";

export type ConvexTarget = { prod?: boolean; deployment?: string; envFile?: string };

function targetArgs(target?: ConvexTarget): string[] {
  if (target?.prod) {
    return target.envFile ? ["--env-file", target.envFile] : ["--prod"];
  }
  return target?.deployment ? ["--deployment", target.deployment] : [];
}

// The convex CLI reads CONVEX_DEPLOY_KEY out of .env.local and then ignores --prod, so a prod
// command with a dev key in the file quietly runs against dev. Blanking it in the child's env
// is enough for the CLI to fall back to --prod and the logged-in session.
function targetEnv(target?: ConvexTarget): Record<string, string> | undefined {
  return target?.prod && !target.envFile ? { CONVEX_DEPLOY_KEY: "" } : undefined;
}

function unquoteEnvValue(value: string): string {
  const q = value[0];
  if ((q === '"' || q === "'") && value.length >= 2 && value[value.length - 1] === q) {
    const inner = value.slice(1, -1);
    return q === '"' ? inner.replace(/\\n/g, "\n") : inner;
  }
  return value;
}

function quoteEnvValue(value: string): string {
  if (!/[#'"`\n\r]/.test(value) && value === value.trim()) return value;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes("`")) return `\`${value}\``;
  if (!value.includes('"') && !/\\[nr]/.test(value)) {
    return `"${value.replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  }
  throw new Error(
    "value has ', \", ` and backslash escapes together, which an env file can't hold. Set it in the Convex dashboard instead",
  );
}

export async function envMap(target?: ConvexTarget): Promise<Map<string, string> | null> {
  const argv = [dlx(), "convex", "env", "list", ...targetArgs(target)];
  const { code, stdout } = await run(argv, { env: targetEnv(target) });
  if (code !== 0) return null;
  return parseKeyValueLines(stdout, unquoteEnvValue);
}

export async function envSet(name: string, value: string, target?: ConvexTarget): Promise<void> {
  await withTempEnvFile([`${name}=${quoteEnvValue(value)}`], (file) =>
    envSetFromFile(file, target, { force: true }),
  );
}

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
  const { code, stderr } = await run(argv, { env: targetEnv(target) });
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
  if (!value) return undefined;
  const m = /^(?:dev|prod):(.+)$/.exec(value);
  return m ? m[1] : value;
}

function devDeploymentFromDeployKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return /^(dev:[^|:\s]+)\|/.exec(key)?.[1];
}

export async function recordedOrDerivedDeployment(
  localEnv: Map<string, string>,
  onDerived: (ref: string) => Promise<void>,
): Promise<string | undefined> {
  const recorded = localEnv.get("CONVEX_DEPLOYMENT");
  if (recorded) return recorded;
  const derived = devDeploymentFromDeployKey(localEnv.get("CONVEX_DEPLOY_KEY"));
  if (!derived) return undefined;
  await onDerived(derived);
  return derived;
}
