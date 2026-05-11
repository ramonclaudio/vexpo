/**
 * Wrappers for `eas integrations:asc:*`. Newer EAS-native path for linking
 * an EAS project to an App Store Connect app via API key. Complements (and
 * partially replaces) `vexpo apple asc-key`.
 */

import { easJson, easSpawn } from "./eas-cli.ts";

export type AscStatus = {
  connected: boolean;
  ascApp?: {
    id?: string;
    bundleId?: string;
    name?: string;
  };
} & Record<string, unknown>;

export async function ascStatus(): Promise<AscStatus> {
  return easJson<AscStatus>(["integrations:asc:status"]);
}

export async function ascConnect(
  opts: {
    apiKeyId?: string;
    ascAppId?: string;
    bundleId?: string;
  } = {},
): Promise<number> {
  return easSpawn([
    "integrations:asc:connect",
    opts.apiKeyId ? "--api-key-id" : null,
    opts.apiKeyId,
    opts.ascAppId ? "--asc-app-id" : null,
    opts.ascAppId,
    opts.bundleId ? "--bundle-id" : null,
    opts.bundleId,
  ]);
}
