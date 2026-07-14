import { access } from "node:fs/promises";

import { withTempEnvFile } from "./env-files.ts";
import { dlx } from "./pkg-manager.ts";
import { run } from "./proc.ts";

export type ConvexTarget = { prod?: boolean; deployment?: string; envFile?: string };

function targetArgs(target?: ConvexTarget): string[] {
  if (target?.prod) {
    // A dev CONVEX_DEPLOY_KEY in .env.local shadows `--prod`: the Convex CLI
    // uses the key's (dev) deployment and silently ignores --prod, so prod env
    // ops land on the dev deployment. When the caller knows the prod source
    // file, point the CLI at it (`--env-file`) so it reads the prod
    // CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY from there instead of .env.local.
    return target.envFile ? ["--env-file", target.envFile] : ["--prod"];
  }
  // Only cross-deployment reads (`convex migrate --from`, `apple jwt
  // --copy-from`) pass an explicit deployment. The flag resolves through the
  // platform API, which needs the user's login, so passing it for the ambient
  // deployment would break deploy-key auth on integration-created deployments
  // (EAS-managed teams). Flagless, the CLI reads CONVEX_DEPLOYMENT /
  // CONVEX_DEPLOY_KEY from .env.local and the environment itself.
  return target?.deployment ? ["--deployment", target.deployment] : [];
}

/**
 * `convex env list` prints values via the CLI's dotfile formatter, which wraps
 * values containing #, quotes, backticks, or newlines in quotes and escapes
 * newlines as literal `\n`. Undo that so the map holds the real value (the write
 * path passes it back literally; the CLI re-quotes on its own).
 */
function unquoteEnvValue(value: string): string {
  const q = value[0];
  if ((q === '"' || q === "'") && value.length >= 2 && value[value.length - 1] === q) {
    const inner = value.slice(1, -1);
    return q === '"' ? inner.replace(/\\n/g, "\n") : inner;
  }
  return value;
}

/**
 * Write a value the way `convex env set --from-file` reads it back: the CLI
 * parses the file with dotenv, whose quote rules are asymmetric. Single/backtick
 * quotes are fully literal. Double quotes expand \n and \r with no way to escape
 * a backslash, so any value carrying a literal \n sequence must not be
 * double-quoted or it silently gains real newlines (PEM keys, JSON blobs).
 * Prefer the literal quote forms; a value that exhausts them cannot be
 * represented in a dotenv file, so fail loud instead of corrupting the secret.
 */
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

/**
 * Returns null on a non-zero `convex env list` (auth/CLI failure or an
 * unreachable deployment) so callers can tell "failed to read" from "genuinely
 * empty". Treating a failure as an empty map makes every remote var look absent,
 * which turns an env push into a blind overwrite of the deployment.
 */
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

/**
 * Set a single var. The value is written to a 0600 file in a fresh 0700 mkdtemp
 * dir and passed via `--from-file`, never as an argv element, so session and
 * signing secrets (BETTER_AUTH_SECRET, APPLE_CLIENT_SECRET, RESEND_API_KEY, ...)
 * never land in the process table where any local user could read them.
 */
export async function envSet(name: string, value: string, target?: ConvexTarget): Promise<void> {
  await withTempEnvFile([`${name}=${quoteEnvValue(value)}`], (file) =>
    envSetFromFile(file, target, { force: true }),
  );
}

/**
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
  if (!value) return undefined;
  const m = /^(?:dev|prod|preview):(.+)$/.exec(value);
  return m ? m[1] : value;
}

/**
 * A deploy key names its own deployment before the `|`:
 * `dev:quick-fox-123|<token>`. eas-cli 21's `integrations:convex:connect`
 * writes only CONVEX_DEPLOY_KEY to .env.local, no CONVEX_DEPLOYMENT line, so
 * the ref has to be recovered from the key. Project-scoped keys
 * (`project:<team>:<project>|...`) name no deployment and return undefined.
 */
export function deploymentRefFromDeployKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const m = /^((?:dev|prod|preview):[^|:\s]+)\|/.exec(key);
  return m?.[1];
}
