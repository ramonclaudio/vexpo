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

/** Submit profiles whose `ios` block has no `ascAppId` (for doctor nudges). */
export function submitProfilesMissingAscAppId(easJson: string): string[] {
  let cfg: EasJson;
  try {
    cfg = JSON.parse(easJson) as EasJson;
  } catch {
    return [];
  }
  return Object.entries(cfg.submit ?? {})
    .filter(([, p]) => p?.ios !== undefined && !p.ios.ascAppId)
    .map(([name]) => name);
}

/** True when any submit profile's `ios` block lacks this exact `ascAppId`. */
function needsAscAppId(easJson: string, ascAppId: string): boolean {
  let cfg: EasJson;
  try {
    cfg = JSON.parse(easJson) as EasJson;
  } catch {
    return false;
  }
  return Object.values(cfg.submit ?? {}).some(
    (p) => p?.ios !== undefined && p.ios.ascAppId !== ascAppId,
  );
}

/**
 * Write `ascAppId` into every submit profile's `ios` block, preserving the
 * file's formatting (a surgical text edit, not a reparse-and-reprint that would
 * reflow unrelated compact arrays). Idempotent: updates an existing ascAppId,
 * inserts where absent, returns the input unchanged when nothing needs to
 * change. Scoped to the `submit` section so build-profile `ios` blocks are left
 * alone.
 */
export function withAscAppId(easJson: string, ascAppId: string): string {
  if (!needsAscAppId(easJson, ascAppId)) return easJson;
  const submitAt = easJson.indexOf('"submit"');
  if (submitAt === -1) return easJson;
  const head = easJson.slice(0, submitAt);
  let tail = easJson.slice(submitAt);
  const value = JSON.stringify(ascAppId);
  // Update any existing ascAppId values in submit to the new id.
  tail = tail.replace(/"ascAppId"(\s*):(\s*)"[^"]*"/g, `"ascAppId"$1:$2${value}`);
  // Insert before the first key of each submit `ios` block that has no ascAppId.
  tail = tail.replace(
    /("ios"\s*:\s*\{)(\s*\n)(\s*)("(?!ascAppId)[A-Za-z])/g,
    (_full, open, nl, indent, firstKey) =>
      `${open}${nl}${indent}"ascAppId": ${value},${nl}${indent}${firstKey}`,
  );
  return head + tail;
}
