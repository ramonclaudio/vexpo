import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileExists } from "./fs.ts";

// `eq > 0` rather than `>= 0`: a line starting with `=` has no key, and a value
// may itself contain `=`, so only the first one splits.
export function parseKeyValueLines(
  stdout: string,
  transform: (value: string) => string = (v) => v,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of stdout.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) out.set(trimmed.slice(0, eq), transform(trimmed.slice(eq + 1)));
  }
  return out;
}

export async function withTempEnvFile<T>(
  lines: string[],
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "vexpo-env-"));
  const file = join(dir, "env");
  try {
    await writeFile(file, lines.join("\n") + "\n", { mode: 0o600 });
    return await fn(file);
  } finally {
    await unlink(file).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
}

export type Channel = "dev" | "prod";

export type Destination =
  | { type: "convex"; key: string; channel: Channel }
  | {
      type: "eas";
      key: string;
      environments: readonly ("development" | "preview" | "production")[];
    };

// Every key routes to exactly one destination. `key` only differs from the map
// key for APPLE_SERVICES_ID, which Convex knows as APPLE_CLIENT_ID.
type RoutingEntry = { type: "eas" | "convex"; key?: string };

const EAS: RoutingEntry = { type: "eas" };
const CONVEX: RoutingEntry = { type: "convex" };

export const ROUTING: Record<string, RoutingEntry> = {
  EXPO_PUBLIC_CONVEX_URL: EAS,
  EXPO_PUBLIC_CONVEX_SITE_URL: EAS,
  EXPO_PUBLIC_SITE_URL: EAS,
  EXPO_PUBLIC_APP_BUNDLE_ID: EAS,
  EXPO_PUBLIC_APPLE_TEAM_ID: EAS,
  EXPO_PUBLIC_EXPO_OWNER: EAS,

  SITE_URL: CONVEX,
  BETTER_AUTH_SECRET: CONVEX,
  BETTER_AUTH_SECRETS: CONVEX,
  APP_NAME: CONVEX,
  RESEND_API_KEY: CONVEX,
  EMAIL_FROM: CONVEX,
  RESEND_WEBHOOK_SECRET: CONVEX,
  RESEND_TEST_MODE: CONVEX,
  REQUIRE_EMAIL_VERIFICATION: CONVEX,
  GUEST_MODE: CONVEX,
  APP_BUNDLE_ID: CONVEX,
  APPLE_CLIENT_ID: CONVEX,
  APPLE_CLIENT_SECRET: CONVEX,
  APPLE_TEAM_ID: CONVEX,
  APPLE_KEY_ID: CONVEX,

  APPLE_SERVICES_ID: { type: "convex", key: "APPLE_CLIENT_ID" },
};

function destinationFor(sourceKey: string, entry: RoutingEntry, channel: Channel): Destination {
  const key = entry.key ?? sourceKey;
  return entry.type === "eas"
    ? {
        type: "eas",
        key,
        environments: channel === "prod" ? ["production", "preview"] : ["development"],
      }
    : { type: "convex", key, channel };
}

const IGNORED_KEYS = new Set(["CONVEX_DEPLOYMENT"]);

export const MANUAL_EAS_SECRETS: Record<string, string> = {
  APPLE_P8_PRIVATE_KEY:
    "eas env:create --name APPLE_P8_PRIVATE_KEY --value-file <path>.p8 --environment production --visibility secret",
  CONVEX_DEPLOY_KEY:
    "eas env:create --name CONVEX_DEPLOY_KEY --value <prod-deploy-key> --environment production --visibility secret",
};

type EnvLine =
  | { kind: "skip" }
  | { kind: "pair"; key: string; value: string }
  | { kind: "open"; key: string; quote: '"' | "'"; rest: string };

function parseEnvLine(raw: string): EnvLine {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#")) return { kind: "skip" };
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return { kind: "skip" };
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();

  const closed = /^(['"])(.*)\1\s*(?:#.*)?$/.exec(value);
  if (closed) return { kind: "pair", key, value: closed[2] };

  const opens = /^(['"])(.*)$/.exec(value);
  if (opens) {
    const quote = opens[1] === '"' ? '"' : "'";
    const rest = opens[2];
    const closeIdx = rest.indexOf(quote);
    if (closeIdx >= 0) return { kind: "pair", key, value: rest.slice(0, closeIdx) };
    return { kind: "open", key, quote, rest };
  }

  const hashAt = value.search(/\s#/);
  return { kind: "pair", key, value: hashAt >= 0 ? value.slice(0, hashAt).trim() : value };
}

type OpenQuote = { key: string; quote: '"' | "'"; buffer: string };

export async function readEnvFile(path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!(await fileExists(path))) return out;
  const text = (await readFile(path, "utf8")).replace(/^\ufeff/, "").replace(/\r\n/g, "\n");
  let pending: OpenQuote | null = null;

  for (const raw of text.split("\n")) {
    if (pending) {
      const closeIdx = raw.indexOf(pending.quote);
      if (closeIdx < 0) {
        pending.buffer += `\n${raw}`;
        continue;
      }
      out.set(pending.key, `${pending.buffer}\n${raw.slice(0, closeIdx)}`);
      pending = null;
      continue;
    }
    const line = parseEnvLine(raw);
    if (line.kind === "pair") out.set(line.key, line.value);
    else if (line.kind === "open")
      pending = { key: line.key, quote: line.quote, buffer: line.rest };
  }

  if (pending) out.set(pending.key, pending.buffer);
  return out;
}

export async function findProdEnvFile(): Promise<string | null> {
  if (await fileExists(".env.prod")) return ".env.prod";
  if (await fileExists(".env.production")) return ".env.production";
  return null;
}

export type EnvSource = { path: string; channel: Channel; entries: Map<string, string> };

async function readLocalSource(localPath?: string): Promise<EnvSource | null> {
  const local = localPath ?? ".env.local";
  if (await fileExists(local)) {
    return { path: local, channel: "dev", entries: await readEnvFile(local) };
  }
  if (localPath) throw new Error(`--local-file path does not exist: ${localPath}`);
  return null;
}

async function readProdSource(prodPath?: string): Promise<EnvSource | null> {
  for (const candidate of prodPath ? [prodPath] : [".env.prod", ".env.production"]) {
    if (await fileExists(candidate)) {
      return { path: candidate, channel: "prod", entries: await readEnvFile(candidate) };
    }
  }
  if (prodPath) throw new Error(`--prod-file path does not exist: ${prodPath}`);
  return null;
}

export async function readSources(paths?: { local?: string; prod?: string }): Promise<EnvSource[]> {
  const local = await readLocalSource(paths?.local);
  const prod = await readProdSource(paths?.prod);
  return [local, prod].filter((source) => source !== null);
}

export type SyncEntry = {
  sourceFile: string;
  sourceKey: string;
  channel: Channel;
  value: string;
  destinations: Destination[];
};

export function buildPlan(sources: EnvSource[]): SyncEntry[] {
  const entries: SyncEntry[] = [];
  for (const src of sources) {
    for (const [key, value] of src.entries) {
      if (IGNORED_KEYS.has(key)) continue;
      const route = ROUTING[key];
      if (!route) continue;
      entries.push({
        sourceFile: src.path,
        sourceKey: key,
        channel: src.channel,
        value,
        destinations: [destinationFor(key, route, src.channel)],
      });
    }
  }
  return entries;
}

export function unrecognizedKeys(sources: EnvSource[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    for (const key of src.entries.keys()) {
      if (IGNORED_KEYS.has(key)) continue;
      if (!ROUTING[key]) out.add(key);
    }
  }
  return [...out].toSorted();
}

export function missingKeys(sources: EnvSource[]): { dev: string[]; prod: string[] } {
  const dev = new Set(Object.keys(ROUTING));
  const prod = new Set(Object.keys(ROUTING));
  for (const src of sources) {
    const target = src.channel === "prod" ? prod : dev;
    for (const k of src.entries.keys()) target.delete(k);
  }
  return { dev: [...dev].toSorted(), prod: [...prod].toSorted() };
}
