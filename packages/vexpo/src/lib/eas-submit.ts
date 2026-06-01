/**
 * eas.json submit-profile helpers.
 *
 * `eas submit` resolves the App Store Connect app id ONLY from the submit
 * profile's `ascAppId` (no CLI flag, no env var) or interactively. So a
 * non-interactive submit (CI, scripts, background) needs `ascAppId` in eas.json;
 * the ASC integration alone only covers interactive mode. The upstream template
 * ships generic (no ascAppId); `vexpo asc` writes the fork's id here after
 * connecting, the same per-fork-fill pattern as store.config.json + `vexpo
 * rebrand`.
 */

type EasJson = { submit?: Record<string, { ios?: { ascAppId?: string } }> };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function submitProfilesMissingAscAppId(easJson: string): string[] {
  let cfg: EasJson;
  try {
    cfg = JSON.parse(easJson) as EasJson;
  } catch {
    return [];
  }
  return Object.entries(cfg.submit ?? {})
    .filter(([, p]) => isObject(p?.ios) && !p.ios.ascAppId)
    .map(([name]) => name);
}

function needsAscAppId(easJson: string, ascAppId: string): boolean {
  let cfg: EasJson;
  try {
    cfg = JSON.parse(easJson) as EasJson;
  } catch {
    return false;
  }
  return Object.values(cfg.submit ?? {}).some(
    (p) => isObject(p?.ios) && p.ios.ascAppId !== ascAppId,
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
  if (!needsAscAppId(easJson, ascAppId)) return easJson;
  const cfg = JSON.parse(easJson) as EasJson;
  for (const profile of Object.values(cfg.submit ?? {})) {
    if (isObject(profile?.ios)) profile.ios.ascAppId = ascAppId;
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}
