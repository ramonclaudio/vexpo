import type { AscClient } from "./asc-api.ts";
import { isRecord } from "./json.ts";
import { entriesOf, error, firstSeen, oneOf, warn, type LintIssue } from "./lint.ts";

export type { LintIssue };

// Apple's `AccessibilityDeclaration.Attributes` is nine booleans plus the
// device family. There is no support level: a feature is claimed or it is not,
// and anything you leave out defaults to false.
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

// Not every feature exists on every platform. Claiming one Apple does not offer
// there is a declaration that cannot be honoured, so it is an error, not a warning.
// From Apple's own feature-by-platform table: Voice Control is not on tvOS or
// watchOS, and Larger Text is not on macOS. Everything else is on all six.
const UNAVAILABLE: Partial<Record<AccessibilityFlag, DeviceFamily[]>> = {
  supportsVoiceControl: ["APPLE_TV", "APPLE_WATCH"],
  supportsLargerText: ["MAC"],
};

export type AccessibilityEntry = { deviceFamily: DeviceFamily } & Partial<
  Record<AccessibilityFlag, boolean>
>;

export function lintAccessibilityConfig(config: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  const entries = entriesOf(config, issues);
  if (!entries) return issues;
  if (entries.length === 0) {
    issues.push(warn("`entries` is empty; declare at least one device family."));
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

export function fetchAccessibilityDeclarations(client: AscClient, appId: string): Promise<unknown> {
  return client.request("GET", `/v1/apps/${appId}/accessibilityDeclarations`);
}

type RemoteDeclaration = {
  id: string;
  attributes?: { deviceFamily?: string; state?: string } & Partial<
    Record<AccessibilityFlag, boolean>
  >;
};

// Apple defaults every unlisted flag to false, so the payload always carries all
// nine. A half-filled PATCH would silently drop the claims it left out.
function attributesOf(entry: AccessibilityEntry): Record<string, boolean> {
  return Object.fromEntries(ACCESSIBILITY_FLAGS.map((f) => [f, entry[f] === true]));
}

export type PushPlan = {
  deviceFamily: string;
  action: "create" | "update" | "blocked";
  id?: string;
  state?: string;
};

/**
 * What `push` would do to each entry. A declaration Apple has already published
 * is read-only, so it is reported rather than attempted.
 */
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

/** Moves a DRAFT declaration onto the App Store page. */
export async function publishAccessibilityDeclaration(
  client: AscClient,
  id: string,
): Promise<{ data: RemoteDeclaration }> {
  return client.request("PATCH", `/v1/accessibilityDeclarations/${id}`, {
    data: { type: "accessibilityDeclarations", id, attributes: { publish: true } },
  });
}

/**
 * The accessibility URL is a link on the App Store page, separate from the
 * declarations. Apple's own overview points here for anything the nine flags
 * cannot say: in-app accessibility settings, caption languages, and the parts
 * of the app that don't support a feature.
 */
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
