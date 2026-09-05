import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileExists } from "./fs.ts";

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

type RoutingEntry = {
  routes: (channel: Channel) => Destination[];
};

const easEnvFor = (channel: Channel): readonly ("development" | "preview" | "production")[] =>
  channel === "prod" ? ["production", "preview"] : ["development"];

export const ROUTING: Record<string, RoutingEntry> = {
  EXPO_PUBLIC_CONVEX_URL: {
    routes: (c) => [{ type: "eas", key: "EXPO_PUBLIC_CONVEX_URL", environments: easEnvFor(c) }],
  },
  EXPO_PUBLIC_CONVEX_SITE_URL: {
    routes: (c) => [
      { type: "eas", key: "EXPO_PUBLIC_CONVEX_SITE_URL", environments: easEnvFor(c) },
    ],
  },
  EXPO_PUBLIC_SITE_URL: {
    routes: (c) => [{ type: "eas", key: "EXPO_PUBLIC_SITE_URL", environments: easEnvFor(c) }],
  },
  EXPO_PUBLIC_APP_BUNDLE_ID: {
    routes: (c) => [{ type: "eas", key: "EXPO_PUBLIC_APP_BUNDLE_ID", environments: easEnvFor(c) }],
  },
  EXPO_PUBLIC_APPLE_TEAM_ID: {
    routes: (c) => [{ type: "eas", key: "EXPO_PUBLIC_APPLE_TEAM_ID", environments: easEnvFor(c) }],
  },
  EXPO_PUBLIC_EXPO_OWNER: {
    routes: (c) => [{ type: "eas", key: "EXPO_PUBLIC_EXPO_OWNER", environments: easEnvFor(c) }],
  },

  SITE_URL: { routes: (c) => [{ type: "convex", key: "SITE_URL", channel: c }] },
  BETTER_AUTH_SECRET: {
    routes: (c) => [{ type: "convex", key: "BETTER_AUTH_SECRET", channel: c }],
  },
  BETTER_AUTH_SECRETS: {
    routes: (c) => [{ type: "convex", key: "BETTER_AUTH_SECRETS", channel: c }],
  },
  APP_NAME: { routes: (c) => [{ type: "convex", key: "APP_NAME", channel: c }] },
  RESEND_API_KEY: { routes: (c) => [{ type: "convex", key: "RESEND_API_KEY", channel: c }] },
  EMAIL_FROM: { routes: (c) => [{ type: "convex", key: "EMAIL_FROM", channel: c }] },
  RESEND_WEBHOOK_SECRET: {
    routes: (c) => [{ type: "convex", key: "RESEND_WEBHOOK_SECRET", channel: c }],
  },
  RESEND_TEST_MODE: {
    routes: (c) => [{ type: "convex", key: "RESEND_TEST_MODE", channel: c }],
  },
  REQUIRE_EMAIL_VERIFICATION: {
    routes: (c) => [{ type: "convex", key: "REQUIRE_EMAIL_VERIFICATION", channel: c }],
  },
  GUEST_MODE: {
    routes: (c) => [{ type: "convex", key: "GUEST_MODE", channel: c }],
  },
  APP_BUNDLE_ID: { routes: (c) => [{ type: "convex", key: "APP_BUNDLE_ID", channel: c }] },
  APPLE_CLIENT_ID: { routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_ID", channel: c }] },
  APPLE_CLIENT_SECRET: {
    routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_SECRET", channel: c }],
  },

  APPLE_TEAM_ID: {
    routes: (c) => [{ type: "convex", key: "APPLE_TEAM_ID", channel: c }],
  },
  APPLE_KEY_ID: {
    routes: (c) => [{ type: "convex", key: "APPLE_KEY_ID", channel: c }],
  },

  APPLE_SERVICES_ID: {
    routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_ID", channel: c }],
  },
};

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
      const destinations = route.routes(src.channel);
      if (destinations.length === 0) continue;
      entries.push({
        sourceFile: src.path,
        sourceKey: key,
        channel: src.channel,
        value,
        destinations,
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
