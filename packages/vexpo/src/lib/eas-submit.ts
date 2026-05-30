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

/** Submit profiles whose `ios` block has no `ascAppId` (for doctor nudges). */
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

/** True when any submit profile's `ios` object lacks this exact `ascAppId`. */
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
 * Write `ascAppId` into every submit profile's `ios` block, preserving the
 * file's formatting where it can. The surgical text edit keeps the common
 * pretty-printed shape's formatting (no reflow of compact arrays); if it can't
 * reach a profile (empty or inline `ios` block), it falls back to parse + reprint
 * so the write is never silently skipped. Idempotent.
 */
export function withAscAppId(easJson: string, ascAppId: string): string {
  if (!needsAscAppId(easJson, ascAppId)) return easJson;
  const surgical = surgicalSetAscAppId(easJson, ascAppId);
  if (!needsAscAppId(surgical, ascAppId)) return surgical;
  const cfg = JSON.parse(easJson) as EasJson;
  for (const profile of Object.values(cfg.submit ?? {})) {
    if (isObject(profile?.ios)) profile.ios.ascAppId = ascAppId;
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}

/**
 * Insert/update `ascAppId` in each submit `ios` block via a text edit, scoped to
 * the `submit` object's braces so sibling top-level sections (`build`) are never
 * touched regardless of key order. Matches the pretty-printed shape only; callers
 * fall back to a reparse when this leaves a profile unwritten.
 */
function surgicalSetAscAppId(easJson: string, ascAppId: string): string {
  const span = submitObjectSpan(easJson);
  if (!span) return easJson;
  const value = JSON.stringify(ascAppId);
  let body = easJson.slice(span.start, span.end);
  // Update any existing ascAppId values to the new id.
  body = body.replace(/"ascAppId"(\s*):(\s*)"[^"]*"/g, `"ascAppId"$1:$2${value}`);
  // Insert before the first key of each `ios` block that has no ascAppId.
  body = body.replace(
    /("ios"\s*:\s*\{)(\s*\n)(\s*)("(?!ascAppId)[A-Za-z])/g,
    (_full, open, nl, indent, firstKey) =>
      `${open}${nl}${indent}"ascAppId": ${value},${nl}${indent}${firstKey}`,
  );
  return easJson.slice(0, span.start) + body + easJson.slice(span.end);
}

/** [start, end) of the `submit` value's `{...}`, string-aware so braces in strings don't count. */
function submitObjectSpan(easJson: string): { start: number; end: number } | null {
  const key = easJson.indexOf('"submit"');
  if (key === -1) return null;
  const open = easJson.indexOf("{", key);
  if (open === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < easJson.length; i++) {
    const c = easJson[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { start: open, end: i + 1 };
  }
  return null;
}
