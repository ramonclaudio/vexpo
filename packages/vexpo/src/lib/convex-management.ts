import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { fetchWithTimeout } from "./http-retry.ts";

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

export type TokenStatus = "valid" | "unauthorized" | "no-token";

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

async function post<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(
    `${BASE}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Convex-Client": "vexpo-cli",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    15_000,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Convex Platform POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

async function requireToken(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("not logged in to Convex (no ~/.convex/config.json accessToken)");
  return token;
}

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

export async function resolveProdDeployment(anyDeploymentName: string): Promise<string | null> {
  const deployments = await listProjectDeployments(anyDeploymentName);
  if (!deployments) return null;
  const prods = deploymentsOfType(deployments, "prod");
  return (prods.find((d) => d.isDefault) ?? prods[0])?.name ?? null;
}

export async function mintProdDeployKey(
  anyDeploymentName: string,
  name = "vexpo",
): Promise<{ key: string; deployment: string } | null> {
  const deployment = await resolveProdDeployment(anyDeploymentName);
  if (!deployment) return null;
  return { key: await mintDeployKey(deployment, { name }), deployment };
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
