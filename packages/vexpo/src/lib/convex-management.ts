/**
 * Thin client for the Convex Platform (management) API at
 * https://api.convex.dev/v1, the same surface `@convex-dev/platform` wraps. The
 * convex CLI has no `deployment list` subcommand, so this is the only way to
 * enumerate every deployment in a project (e.g. to catch a duplicate dev
 * deployment after the EAS integration created a second one).
 *
 * Auth reuses the CLI's own login token from ~/.convex/config.json (the same
 * `accessToken` the convex CLI sends as a Bearer). Everything degrades to null
 * on any failure (no token, offline, unauthorized) so callers can skip a check
 * rather than crash.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = `${process.env.CONVEX_PROVISION_HOST || "https://api.convex.dev"}/v1`;

type DeploymentType = "dev" | "prod" | "preview" | "custom";

export type PlatformDeployment = {
  name: string;
  deploymentType: DeploymentType;
  projectId: number;
  reference?: string;
  isDefault?: boolean;
  deploymentUrl?: string;
};

async function accessToken(): Promise<string | null> {
  try {
    const raw = await readFile(join(homedir(), ".convex", "config.json"), "utf8");
    const token = (JSON.parse(raw) as { accessToken?: string }).accessToken;
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

async function get<T>(token: string, path: string): Promise<T | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Convex-Client": "vexpo-cli" },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** POST that throws on failure (writes must surface errors, unlike the best-effort reads above). */
async function post<T>(token: string, path: string, body: unknown): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Convex-Client": "vexpo-cli",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Convex Platform POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function requireToken(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("not logged in to Convex (no ~/.convex/config.json accessToken)");
  return token;
}

/**
 * Mint a deploy key for a deployment via the Platform API. Returns the key
 * (returned ONLY at creation, never re-readable, so write it immediately). Unlike
 * `npx convex deployment token create`, the API auth is the Bearer PAT alone, so
 * this works even when a CONVEX_DEPLOY_KEY is loaded in the process env. Throws on
 * failure. expiresAtMs, if set, must be >=30min in the future.
 */
export async function mintDeployKey(
  deploymentName: string,
  opts?: { name?: string; expiresAtMs?: number },
): Promise<string> {
  const token = await requireToken();
  const body: { name: string; expiresAt?: number } = { name: opts?.name ?? "vexpo" };
  if (opts?.expiresAtMs) {
    if (opts.expiresAtMs < Date.now() + 30 * 60_000) {
      throw new Error("deploy key expiresAtMs must be at least 30 minutes in the future");
    }
    body.expiresAt = opts.expiresAtMs;
  }
  const res = await post<{ deployKey?: string }>(
    token,
    `/deployments/${deploymentName}/create_deploy_key`,
    body,
  );
  if (!res?.deployKey) throw new Error("create_deploy_key returned no deployKey");
  return res.deployKey;
}

/** Delete a deploy key by its full value, encoded token, or unique name. Throws on failure. */
export async function deleteDeployKey(deploymentName: string, id: string): Promise<void> {
  const token = await requireToken();
  await post(token, `/deployments/${deploymentName}/delete_deploy_key`, { id });
}

/** The default prod deployment name for the project that `anyDeploymentName` belongs to, or null. */
export async function resolveProdDeployment(anyDeploymentName: string): Promise<string | null> {
  const deployments = await listProjectDeployments(anyDeploymentName);
  if (!deployments) return null;
  const prods = deploymentsOfType(deployments, "prod");
  return (prods.find((d) => d.isDefault) ?? prods[0])?.name ?? null;
}

/**
 * Every deployment in the project that `deploymentName` belongs to. Resolves the
 * project from the deployment, then lists its deployments. Returns null on any
 * failure so callers skip gracefully.
 */
export async function listProjectDeployments(
  deploymentName: string,
): Promise<PlatformDeployment[] | null> {
  const token = await accessToken();
  if (!token) return null;
  const dep = await get<{ projectId?: number }>(token, `/deployments/${deploymentName}`);
  if (!dep?.projectId) return null;
  const list = await get<PlatformDeployment[]>(
    token,
    `/projects/${dep.projectId}/list_deployments`,
  );
  return Array.isArray(list) ? list : null;
}

/** Deployments of a given type, in dashboard order. Pure, for testability. */
export function deploymentsOfType(
  deployments: readonly PlatformDeployment[],
  type: DeploymentType,
): PlatformDeployment[] {
  return deployments.filter((d) => d.deploymentType === type);
}

/** One-line label for a deployment: `name (reference)`. */
export function describeDeployment(d: PlatformDeployment): string {
  return d.reference ? `${d.name} (${d.reference})` : d.name;
}
