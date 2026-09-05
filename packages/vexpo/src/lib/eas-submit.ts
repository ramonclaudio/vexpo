import { isRecord } from "./json.ts";

type SubmitIos = {
  ascAppId?: string;
  ascApiKeyPath?: string;
  ascApiKeyId?: string;
  ascApiKeyIssuerId?: string;
};
type EasJson = { submit?: Record<string, { ios?: SubmitIos }> };

function parseEasJson(easJson: string): EasJson | null {
  try {
    return JSON.parse(easJson) as EasJson;
  } catch {
    return null;
  }
}

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

export function withAscAppId(easJson: string, ascAppId: string): string {
  const cfg = parseEasJson(easJson);
  if (!cfg || !needsAscAppId(cfg, ascAppId)) return easJson;
  for (const profile of Object.values(cfg.submit ?? {})) {
    if (isRecord(profile?.ios)) profile.ios.ascAppId = ascAppId;
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}

export type AscApiKeyFields = { path: string; keyId: string; issuerId: string };

function needsAscApiKey(cfg: EasJson, key: AscApiKeyFields): boolean {
  return Object.values(cfg.submit ?? {}).some(
    (p) =>
      isRecord(p?.ios) &&
      (p.ios.ascApiKeyPath !== key.path ||
        p.ios.ascApiKeyId !== key.keyId ||
        p.ios.ascApiKeyIssuerId !== key.issuerId),
  );
}

export function withAscApiKey(easJson: string, key: AscApiKeyFields): string {
  const cfg = parseEasJson(easJson);
  if (!cfg || !needsAscApiKey(cfg, key)) return easJson;
  for (const profile of Object.values(cfg.submit ?? {})) {
    if (!isRecord(profile?.ios)) continue;
    profile.ios.ascApiKeyPath = key.path;
    profile.ios.ascApiKeyId = key.keyId;
    profile.ios.ascApiKeyIssuerId = key.issuerId;
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}
