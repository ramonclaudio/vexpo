/**
 * Multi-file env reader for setup-lite. Reads .env.local (dev) and
 * .env.prod (prod), classifies each key by destination, and produces
 * a sync plan: for each (key, source-file) pair, what destinations
 * should it write to and under what name.
 *
 * Routing is centralized in ROUTING below. adding a new var means
 * adding one entry, not editing five scripts.
 */

import { access, readFile } from "node:fs/promises";

export type Channel = "dev" | "prod";

export type Destination =
  | { type: "convex"; key: string; channel: Channel }
  | {
      type: "eas";
      key: string;
      environments: readonly ("development" | "preview" | "production")[];
    };

type RoutingEntry = {
  /** Description for the report */
  description?: string;
  /**
   * Where this key (when present in a source file) should be written.
   * `channel` placeholder gets filled in based on which file the key was read from.
   */
  routes: (channel: Channel) => Destination[];
};

const easEnvFor = (channel: Channel): readonly ("development" | "preview" | "production")[] =>
  channel === "prod" ? ["production", "preview"] : ["development"];

export const ROUTING: Record<string, RoutingEntry> = {
  // EAS-only (build-time public)
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

  // Convex-bound server-side
  SITE_URL: { routes: (c) => [{ type: "convex", key: "SITE_URL", channel: c }] },
  BETTER_AUTH_SECRET: {
    routes: (c) => [{ type: "convex", key: "BETTER_AUTH_SECRET", channel: c }],
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
    description: "writes APPLE_CLIENT_ID on Convex (Better Auth's expected key name)",
    routes: (c) => [{ type: "convex", key: "APPLE_CLIENT_ID", channel: c }],
  },
};

/**
 * Keys that lite mode does NOT sync. They're either file-local pointers used
 * by the CLI themselves, or they belong on a destination that needs explicit
 * handling (`eas env:create --visibility secret`) and we don't want to push
 * them with default visibility by accident.
 */
export const IGNORED_KEYS = new Set(["CONVEX_DEPLOYMENT"]);

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

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readEnvFile(path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!(await fileExists(path))) return out;
  const text = await readFile(path, "utf8");
  let buffer = "";
  let pendingKey: string | null = null;
  let pendingQuote: '"' | "'" | null = null;

  for (const raw of text.split("\n")) {
    if (pendingKey && pendingQuote) {
      // continuation of a multi-line quoted value
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
    if (opensQuote && !value.endsWith(opensQuote[1])) {
      pendingKey = key;
      pendingQuote = opensQuote[1] as '"' | "'";
      buffer = opensQuote[2];
      continue;
    }
    const hashAt = value.search(/\s#/);
    if (hashAt >= 0) value = value.slice(0, hashAt).trim();
    out.set(key, value);
  }
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
    // An explicit `--local-file <path>` that doesn't exist is a user error.
    // Default `.env.local` missing is fine (just nothing to push).
    throw new Error(`--local-file path does not exist: ${paths.local}`);
  }
  for (const p of prodCandidates) {
    if (await fileExists(p)) {
      sources.push({ path: p, channel: "prod", entries: await readEnvFile(p) });
      break;
    }
  }
  if (paths?.prod && !sources.some((s) => s.channel === "prod")) {
    // Same rule for `--prod-file`: explicit missing path is a user error.
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

/** What's in source files but unrecognized. useful for "did you mean" hints. */
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

/** Keys we want but couldn't find in any source file. Useful for "still missing" hints. */
export function missingKeys(sources: EnvSource[]): { dev: string[]; prod: string[] } {
  const dev = new Set(Object.keys(ROUTING));
  const prod = new Set(Object.keys(ROUTING));
  for (const src of sources) {
    const target = src.channel === "prod" ? prod : dev;
    for (const k of src.entries.keys()) target.delete(k);
  }
  return { dev: [...dev].toSorted(), prod: [...prod].toSorted() };
}
