/**
 * Thin status helper for `eas integrations:asc:status`. Used by the setup
 * orchestrator's `apple-asc-link` live check + the asc connect step's
 * idempotency skip. No write helpers: `runAscConnect` spawns eas-cli directly
 * with `EXPO_ASC_API_KEY_*` env vars pre-set, the same orchestration pattern
 * `vexpo apple credentials` uses with `eas credentials:configure-build`.
 *
 * Type matches the OBSERVED output of `eas integrations:asc:status --json`
 * at eas-cli v19.0.0, NOT the literal `buildJsonOutput` return shape in
 * `packages/eas-cli/src/integrations/asc/utils.ts`. The difference: every
 * `--json` payload runs through `printJsonOnlyOutput`'s `sanitizeValue`
 * (`packages/eas-cli/src/utils/json.ts`) which strips fields whose value is
 * `null`. So `appStoreConnectApp` is absent (not `null`) on a not-connected
 * or invalid response, and `name` / `bundleIdentifier` are absent inside the
 * connected payload when Apple returns them as null. Empirically verified
 * against `eas-cli@19.0.0` with this project on 2026-05-19.
 */

import { easJson } from "./eas-cli.ts";

export type AscStatus = {
  action: string;
  project: string;
  status: "connected" | "not-connected" | "invalid";
  appStoreConnectApp?: {
    id: string;
    ascAppIdentifier: string;
    name?: string;
    bundleIdentifier?: string;
    appleUrl: string;
  };
};

export async function ascStatus(): Promise<AscStatus> {
  return easJson<AscStatus>(["integrations:asc:status"]);
}
