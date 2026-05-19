/**
 * Thin status helper for `eas integrations:asc:status`. Used by the setup
 * orchestrator's `apple-asc-link` live check + the asc connect step's
 * idempotency skip. No write helpers: `runAscConnect` spawns eas-cli directly
 * with `EXPO_ASC_API_KEY_*` env vars pre-set, the same orchestration pattern
 * `vexpo apple credentials` uses with `eas credentials:configure-build`.
 *
 * Type mirrors `buildJsonOutput` in `expo/eas-cli`:
 * `packages/eas-cli/src/integrations/asc/utils.ts`.
 */

import { easJson } from "./eas-cli.ts";

export type AscStatus = {
  action: string;
  project: string;
  status: "connected" | "not-connected" | "invalid";
  appStoreConnectApp: null | {
    id: string;
    ascAppIdentifier: string;
    name: string | null;
    bundleIdentifier: string | null;
    appleUrl: string;
  };
};

export async function ascStatus(): Promise<AscStatus> {
  return easJson<AscStatus>(["integrations:asc:status"]);
}
