import { existsSync } from "node:fs";

import { makeAscClient, type AscClient, type AscCredentials } from "./asc-api.ts";
import { readOne } from "./env-local.ts";
import { expandTilde } from "./path.ts";
import { load as loadState } from "./state.ts";

export type AscBootstrap = {
  client: AscClient;
  bundleId?: string;
  ascAppId?: string;
  creds: AscCredentials;
};

export async function loadAscCreds(): Promise<AscCredentials | null> {
  const state = await loadState();
  const rec = state.steps["asc-key"];
  if (!rec?.outputs) return null;
  const out = rec.outputs as Record<string, unknown>;
  const issuerId = out.issuerId as string | undefined;
  const keyId = out.keyId as string | undefined;
  const rawPath = out.p8Path as string | undefined;
  if (!issuerId || !keyId || !rawPath) return null;
  const p8Path = expandTilde(rawPath);
  if (!existsSync(p8Path)) return null;
  return { issuerId, keyId, privateKey: { path: p8Path } };
}

export async function ascBootstrap(): Promise<AscBootstrap> {
  const creds = await loadAscCreds();
  if (!creds) {
    throw new Error("no cached ASC creds. run `vexpo apple asc-key` first");
  }
  const client = makeAscClient(creds);
  const bundleId =
    (await readOne("EXPO_PUBLIC_APP_BUNDLE_ID")) ?? (await readOne("APP_BUNDLE_ID")) ?? undefined;
  let ascAppId: string | undefined;
  if (bundleId) {
    const apps = await client.paginatedList<{
      id: string;
      attributes: { bundleId?: string };
    }>("/v1/apps", { "filter[bundleId]": bundleId }, 5);
    ascAppId = apps[0]?.id;
  }
  return { client, bundleId, ascAppId, creds };
}
