import { makeAscClient, type AscClient, type AscCredentials } from "./asc-api.ts";
import { readOne } from "./env-local.ts";
import { fileExists } from "./fs.ts";
import { expandTilde } from "./path.ts";
import { load as loadState } from "./state.ts";

export async function loadAscCreds(): Promise<AscCredentials | null> {
  const out = (await loadState()).steps["asc-key"]?.outputs;
  const issuerId = out?.issuerId;
  const keyId = out?.keyId;
  const rawPath = out?.p8Path;
  if (typeof issuerId !== "string" || typeof keyId !== "string" || typeof rawPath !== "string") {
    return null;
  }
  const p8Path = expandTilde(rawPath);
  if (!(await fileExists(p8Path))) return null;
  return { issuerId, keyId, p8Path };
}

export async function ascBootstrap(): Promise<{
  client: AscClient;
  bundleId?: string;
  ascAppId?: string;
}> {
  const creds = await loadAscCreds();
  if (!creds) {
    throw new Error("no App Store Connect key cached. Run `vexpo apple asc-key` first");
  }
  const client = makeAscClient(creds);
  const bundleId = await readOne("EXPO_PUBLIC_APP_BUNDLE_ID");
  const ascAppId = bundleId ? (await client.apps.list({ bundleId }))[0]?.id : undefined;
  return { client, bundleId, ascAppId };
}
