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

export type DeploymentType = "dev" | "prod" | "preview" | "custom";

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
