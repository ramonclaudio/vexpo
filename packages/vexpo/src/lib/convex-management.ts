import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { fetchWithTimeout } from "./http-retry.ts";

const BASE = `${process.env.CONVEX_PROVISION_HOST || "https://api.convex.dev"}/v1`;

type DeploymentType = "dev" | "prod" | "preview" | "custom";

type PlatformDeployment = {
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

type TokenStatus = "valid" | "unauthorized" | "no-token";

export async function checkToken(): Promise<TokenStatus> {
  const token = await accessToken();
  if (!token) return "no-token";
  try {
    const res = await fetchWithTimeout(
      `${BASE}/list_personal_access_tokens`,
      { headers: { Authorization: `Bearer ${token}`, "Convex-Client": "vexpo-cli" } },
      8_000,
    );
    return res.status === 401 || res.status === 403 ? "unauthorized" : "valid";
  } catch {
    return "valid";
  }
}

async function get<T>(token: string, path: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(
      `${BASE}${path}`,
      { headers: { Authorization: `Bearer ${token}`, "Convex-Client": "vexpo-cli" } },
      10_000,
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

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

export function deploymentsOfType(
  deployments: readonly PlatformDeployment[],
  type: DeploymentType,
): PlatformDeployment[] {
  return deployments.filter((d) => d.deploymentType === type);
}

export function describeDeployment(d: PlatformDeployment): string {
  return d.reference ? `${d.name} (${d.reference})` : d.name;
}
