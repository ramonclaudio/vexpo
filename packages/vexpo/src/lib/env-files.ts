import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileExists } from "./fs.ts";

/**
 * Write env `lines` to a 0600 file in a fresh 0700 mkdtemp dir, run `fn` with
 * its path, then remove both in finally. Plaintext secrets (BETTER_AUTH_SECRET,
 * RESEND_API_KEY, APPLE_CLIENT_SECRET, ...) never land on a predictable path or
 * in the process table, and never outlive the call. Callers pass secrets via
 * the file, never as an argv element.
 */
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
  /**
   * `channel` placeholder gets filled in based on which file the key was read from.
   */
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
  // Versioned form (e.g. `2:newbase64,1:oldbase64`, highest version active) for
  // rotating the auth secret without invalidating live sessions. Better Auth
  // reads either; prefer this once you need to rotate.
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
  APP_BUNDLE_ID: { routes: (c) => [{ type: "convex", key: "APP_BUNDLE_ID", channel: c }] },
  APPLE_CLIENT_ID: { routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_ID", channel: c }] },
  APPLE_CLIENT_SECRET: {
    routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_SECRET", channel: c }],
  },

  // Apple identity vars. Better Auth reads these from Convex env at runtime
  APPLE_TEAM_ID: {
    routes: (c) => [{ type: "convex", key: "APPLE_TEAM_ID", channel: c }],
  },
  APPLE_KEY_ID: {
    routes: (c) => [{ type: "convex", key: "APPLE_KEY_ID", channel: c }],
  },

  // Cross-named: APPLE_SERVICES_ID locally → APPLE_CLIENT_ID on Convex (Better Auth's expected key name)
  APPLE_SERVICES_ID: {
    routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_ID", channel: c }],
  },
};

/**
 * Keys that lite mode does NOT sync. They're either file-local pointers used
 * by the CLI themselves, or they belong on a destination that needs explicit
 * handling (`eas env:create --visibility secret`) and we don't want to push
 * them with default visibility by accident.
 */
const IGNORED_KEYS = new Set(["CONVEX_DEPLOYMENT"]);

/**
 * Keys that should be set manually as secret-visibility EAS env vars. Lite
 * mode flags them with explicit guidance instead of dropping them silently or
 * pushing them to the wrong place. Only relevant for production; consumers
 * are EAS Workflows (the JWT rotation cron and the Convex deploy step).
 */
export const MANUAL_EAS_SECRETS: Record<string, string> = {
  APPLE_P8_PRIVATE_KEY:
    "eas env:create --name APPLE_P8_PRIVATE_KEY --value-file <path>.p8 --environment production --visibility secret",
  CONVEX_DEPLOY_KEY:
    "eas env:create --name CONVEX_DEPLOY_KEY --value <prod-deploy-key> --environment production --visibility secret",
};

export async function readEnvFile(path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!(await fileExists(path))) return out;
  const text = (await readFile(path, "utf8")).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  let buffer = "";
  let pendingKey: string | null = null;
  let pendingQuote: '"' | "'" | null = null;

  for (const raw of text.split("\n")) {
    if (pendingKey && pendingQuote) {
      const closeIdx = raw.indexOf(pendingQuote);
      if (closeIdx >= 0) {
        buffer += `\n${raw.slice(0, closeIdx)}`;
        out.set(pendingKey, buffer);
        pendingKey = null;
        pendingQuote = null;
        buffer = "";
      } else {
        buffer += `\n${raw}`;
      }
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted = /^(['"])(.*)\1\s*(?:#.*)?$/.exec(value);
    if (quoted) {
      out.set(key, quoted[2]);
      continue;
    }
    const opensQuote = /^(['"])(.*)$/.exec(value);
    if (opensQuote) {
      const quote = opensQuote[1] as '"' | "'";
      const rest = opensQuote[2];
      // A close quote later on the same line ends the value (anything trailing,
      // like a display name, is dropped). Only an unclosed quote spans lines.
      const closeIdx = rest.indexOf(quote);
      if (closeIdx >= 0) {
        out.set(key, rest.slice(0, closeIdx));
        continue;
      }
      pendingKey = key;
      pendingQuote = quote;
      buffer = rest;
      continue;
    }
    const hashAt = value.search(/\s#/);
    if (hashAt >= 0) value = value.slice(0, hashAt).trim();
    out.set(key, value);
  }
  // A quote opened but never closed before EOF keeps the partial value (matching
  // the pre-dedup parser) instead of dropping this key and every key after it.
  if (pendingKey) out.set(pendingKey, buffer);
  return out;
}

export type EnvSource = { path: string; channel: Channel; entries: Map<string, string> };

export async function readSources(paths?: { local?: string; prod?: string }): Promise<EnvSource[]> {
  const local = paths?.local ?? ".env.local";
  const prodCandidates = paths?.prod ? [paths.prod] : [".env.prod", ".env.production"];
  const sources: EnvSource[] = [];
  if (await fileExists(local)) {
    sources.push({ path: local, channel: "dev", entries: await readEnvFile(local) });
  } else if (paths?.local) {
    throw new Error(`--local-file path does not exist: ${paths.local}`);
  }
  for (const p of prodCandidates) {
    if (await fileExists(p)) {
      sources.push({ path: p, channel: "prod", entries: await readEnvFile(p) });
      break;
    }
  }
  if (paths?.prod && !sources.some((s) => s.channel === "prod")) {
    throw new Error(`--prod-file path does not exist: ${paths.prod}`);
  }
  return sources;
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
