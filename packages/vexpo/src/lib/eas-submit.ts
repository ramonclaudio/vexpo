/**
 * eas.json submit-profile helpers.
 *
 * `eas submit` resolves the App Store Connect app id ONLY from the submit
 * profile's `ascAppId` (no CLI flag, no env var) or interactively. So a
 * non-interactive submit (CI, scripts, background) needs `ascAppId` in eas.json;
 * the ASC integration alone only covers interactive mode. The upstream template
 * ships generic (no ascAppId); `vexpo asc connect` writes the fork's id here
 * after connecting, the same per-fork-fill pattern as store.config.json +
 * `vexpo rebrand`.
 */

import { isRecord } from "./json.ts";

type EasJson = { submit?: Record<string, { ios?: { ascAppId?: string } }> };

function parseEasJson(easJson: string): EasJson | null {
  try {
    return JSON.parse(easJson) as EasJson;
  } catch {
    return null;
  }
}

// True when the named submit profile's `ios` block already carries a non-empty
// ascAppId. `eas submit` reads the id only from here, so a non-interactive
// submit can proceed off eas.json alone even when an ASC API lookup is down.
export function submitProfileHasAscAppId(easJson: string, profile: string): boolean {
  const cfg = parseEasJson(easJson);
  const ios = cfg?.submit?.[profile]?.ios;
  return isRecord(ios) && typeof ios.ascAppId === "string" && ios.ascAppId.length > 0;
}

export function submitProfilesMissingAscAppId(easJson: string): string[] {
  const cfg = parseEasJson(easJson);
  if (!cfg) return [];
  return Object.entries(cfg.submit ?? {})
    .filter(([, p]) => isRecord(p?.ios) && !p.ios.ascAppId)
    .map(([name]) => name);
}

function needsAscAppId(cfg: EasJson, ascAppId: string): boolean {
  return Object.values(cfg.submit ?? {}).some(
    (p) => isRecord(p?.ios) && p.ios.ascAppId !== ascAppId,
  );
}

/**
 * Set `ascAppId` on every submit profile's `ios` block. Parses and reprints
 * (standard 2-space JSON) so it is correct for any valid eas.json shape and key
 * order: it touches only each profile's direct `ios.ascAppId` and leaves build
 * profiles, nested keys, and sibling platforms (android) alone. Idempotent;
 * returns the input unchanged when nothing needs to change.
 */
export function withAscAppId(easJson: string, ascAppId: string): string {
  const cfg = parseEasJson(easJson);
  if (!cfg || !needsAscAppId(cfg, ascAppId)) return easJson;
  for (const profile of Object.values(cfg.submit ?? {})) {
    if (isRecord(profile?.ios)) profile.ios.ascAppId = ascAppId;
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}
