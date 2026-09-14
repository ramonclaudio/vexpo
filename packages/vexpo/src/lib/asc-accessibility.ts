import type { AscClient } from "./asc-api.ts";
import { isRecord } from "./json.ts";
import { entriesOf, error, firstSeen, oneOf, warn, type LintIssue } from "./lint.ts";

const ACCESSIBILITY_FLAGS = [
  "supportsVoiceover",
  "supportsVoiceControl",
  "supportsLargerText",
  "supportsSufficientContrast",
  "supportsDarkInterface",
  "supportsDifferentiateWithoutColorAlone",
  "supportsReducedMotion",
  "supportsCaptions",
  "supportsAudioDescriptions",
] as const;

type AccessibilityFlag = (typeof ACCESSIBILITY_FLAGS)[number];

const ACCESSIBILITY_DEVICE_FAMILIES = [
  "IPHONE",
  "IPAD",
  "MAC",
  "APPLE_TV",
  "APPLE_WATCH",
  "VISION",
] as const;

type DeviceFamily = (typeof ACCESSIBILITY_DEVICE_FAMILIES)[number];

// Apple's feature-by-platform table. These flags do not exist on these families.
const UNAVAILABLE: Partial<Record<AccessibilityFlag, DeviceFamily[]>> = {
  supportsVoiceControl: ["APPLE_TV", "APPLE_WATCH"],
  supportsLargerText: ["MAC"],
};

export type AccessibilityEntry = { deviceFamily: DeviceFamily } & Partial<
  Record<AccessibilityFlag, boolean>
>;

// `url` is the accessibility link on the product page. A string sets it, null clears it,
// leaving it out leaves App Store Connect alone.
export type AccessibilityConfig = { url?: string | null; entries: AccessibilityEntry[] };

export function lintAccessibilityConfig(config: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  const entries = entriesOf(config, issues);
  if (!entries) return issues;
  lintUrl(issues, (config as { url?: unknown }).url);
  if (entries.length === 0) {
    issues.push(warn("`entries` is empty. Declare at least one device family."));
  }

  const seen = new Set<string>();
  entries.forEach((raw, index) => {
    const at = `entry[${index}]`;
    if (!isRecord(raw)) {
      issues.push(error(`${at} must be an object`));
      return;
    }
    const family = raw.deviceFamily;
    const familyAt = `${at}.deviceFamily`;
    const familyOk = oneOf(
      issues,
      familyAt,
      family,
      ACCESSIBILITY_DEVICE_FAMILIES,
      "AccessibilityDeviceFamily",
    );
    if (familyOk) firstSeen(seen, issues, familyAt, family as string);

    for (const [key, value] of Object.entries(raw)) {
      if (key === "deviceFamily" || key === "notes") continue;
      lintFlag(issues, `${at}.${key}`, key, value, familyOk ? (family as DeviceFamily) : null);
    }
  });

  return issues;
}

function lintUrl(issues: LintIssue[], url: unknown): void {
  if (url === undefined || url === null) return;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    issues.push(
      error(
        `\`url\` must start with https://, got '${String(url)}'. It is a public link on your App Store page, so Apple rejects anything else.`,
      ),
    );
  }
}

function lintFlag(
  issues: LintIssue[],
  at: string,
  key: string,
  value: unknown,
  family: DeviceFamily | null,
): void {
  if (!ACCESSIBILITY_FLAGS.includes(key as AccessibilityFlag)) {
    issues.push(
      error(
        `${at} is not a valid AccessibilityDeclaration attribute. Allowed: ${ACCESSIBILITY_FLAGS.join(", ")}`,
      ),
    );
    return;
  }
  if (typeof value !== "boolean") {
    issues.push(error(`${at} must be true or false, got '${String(value)}'`));
    return;
  }
  if (!value || !family) return;
  if (UNAVAILABLE[key as AccessibilityFlag]?.includes(family)) {
    issues.push(error(`${at} cannot be true: ${family} has no ${key.slice(8)}.`));
  }
}

export type RemoteDeclaration = {
  id: string;
  attributes?: { deviceFamily?: string; state?: string } & Partial<
    Record<AccessibilityFlag, boolean>
  >;
};

export function fetchAccessibilityDeclarations(
  client: AscClient,
  appId: string,
): Promise<{ data: RemoteDeclaration[] }> {
  return client.request("GET", `/v1/apps/${appId}/accessibilityDeclarations`);
}

// Apple defaults every unlisted flag to false, so a partial PATCH silently drops claims.
function attributesOf(entry: AccessibilityEntry): Record<string, boolean> {
  return Object.fromEntries(ACCESSIBILITY_FLAGS.map((f) => [f, entry[f] === true]));
}

export type PushPlan = {
  deviceFamily: string;
  action: "create" | "update" | "blocked";
  id?: string;
  state?: string;
};

export function planAccessibilityPush(
  entries: AccessibilityEntry[],
  remote: RemoteDeclaration[],
): PushPlan[] {
  return entries.map((entry) => {
    const match = remote.find((r) => r.attributes?.deviceFamily === entry.deviceFamily);
    if (!match) return { deviceFamily: entry.deviceFamily, action: "create" };
    const state = match.attributes?.state;
    const action = state === "DRAFT" ? "update" : "blocked";
    return { deviceFamily: entry.deviceFamily, action, id: match.id, state };
  });
}

export async function createAccessibilityDeclaration(
  client: AscClient,
  appId: string,
  entry: AccessibilityEntry,
): Promise<{ data: RemoteDeclaration }> {
  return client.request("POST", "/v1/accessibilityDeclarations", {
    data: {
      type: "accessibilityDeclarations",
      attributes: { deviceFamily: entry.deviceFamily, ...attributesOf(entry) },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  });
}

export async function updateAccessibilityDeclaration(
  client: AscClient,
  id: string,
  entry: AccessibilityEntry,
): Promise<{ data: RemoteDeclaration }> {
  return client.request("PATCH", `/v1/accessibilityDeclarations/${id}`, {
    data: { type: "accessibilityDeclarations", id, attributes: attributesOf(entry) },
  });
}

export async function publishAccessibilityDeclaration(
  client: AscClient,
  id: string,
): Promise<{ data: RemoteDeclaration }> {
  return client.request("PATCH", `/v1/accessibilityDeclarations/${id}`, {
    data: { type: "accessibilityDeclarations", id, attributes: { publish: true } },
  });
}

export async function fetchAccessibilityUrl(
  client: AscClient,
  appId: string,
): Promise<string | null> {
  const res = await client.request<{
    data?: { attributes?: { accessibilityUrl?: string | null } };
  }>("GET", `/v1/apps/${appId}`, undefined, { "fields[apps]": "accessibilityUrl" });
  return res.data?.attributes?.accessibilityUrl ?? null;
}

export async function setAccessibilityUrl(
  client: AscClient,
  appId: string,
  url: string | null,
): Promise<void> {
  await client.request("PATCH", `/v1/apps/${appId}`, {
    data: { type: "apps", id: appId, attributes: { accessibilityUrl: url } },
  });
}
