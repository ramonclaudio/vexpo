import { access } from "node:fs/promises";

import { withTempEnvFile } from "./env-files.ts";
import { dlx } from "./pkg-manager.ts";
import { run } from "./proc.ts";

export type ConvexTarget = { prod?: boolean; deployment?: string; envFile?: string };

function targetArgs(target?: ConvexTarget): string[] {
  if (target?.prod) {
    return target.envFile ? ["--env-file", target.envFile] : ["--prod"];
  }
  return target?.deployment ? ["--deployment", target.deployment] : [];
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
    "value mixes ', \", ` and backslash escapes in a way dotenv cannot represent; set it in the Convex dashboard instead",
  );
}

export async function envMap(target?: ConvexTarget): Promise<Map<string, string> | null> {
  const argv = [dlx(), "convex", "env", "list", ...targetArgs(target)];
  const { code, stdout } = await run(argv);
  if (code !== 0) return null;
  const out = new Map<string, string>();
  for (const raw of stdout.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) out.set(trimmed.slice(0, eq), unquoteEnvValue(trimmed.slice(eq + 1)));
  }
  return out;
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
  if (!value) return undefined;
  const m = /^(?:dev|prod|preview):(.+)$/.exec(value);
  return m ? m[1] : value;
}

export function deploymentRefFromDeployKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const m = /^((?:dev|prod|preview):[^|:\s]+)\|/.exec(key);
  return m?.[1];
}

export async function recordedOrDerivedDeployment(
  localEnv: Map<string, string>,
  onDerived: (ref: string) => Promise<void>,
): Promise<string | undefined> {
  const recorded = localEnv.get("CONVEX_DEPLOYMENT");
  if (recorded) return recorded;
  const derived = deploymentRefFromDeployKey(localEnv.get("CONVEX_DEPLOY_KEY"));
  if (!derived?.startsWith("dev:")) return undefined;
  await onDerived(derived);
  return derived;
}
