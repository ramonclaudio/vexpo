/**
 * App Store Connect REST client. Covers the endpoints vexpo provisions
 * outside of EAS: the Sign In with Apple Services ID (a `BundleId` resource
 * with `platform === "SERVICES"`) and the `APPLE_ID_AUTH` capability bound
 * to the App's primary BundleId.
 *
 * Token lifetime is memoized in-process and re-signed at exp - 60s.
 * Errors come back from ASC as `{errors: [{status, code, title, detail, source}]}`,
 * which we parse into AscApiError so callers can branch on `.code`.
 *
 * Retry: 5 attempts on 429/502/503/504, honoring Retry-After. 401 forces
 * a single re-sign in case of clock skew, then bails. Other 4xx are
 * deterministic and never retried.
 *
 * https://developer.apple.com/documentation/appstoreconnectapi
 */

import { signAscToken, type AscJwtArgs } from "./asc-jwt.ts";

export const ASC_BASE = "https://api.appstoreconnect.apple.com";

export type AscCredentials = AscJwtArgs;

export type BundleIdPlatform = "IOS" | "MAC_OS" | "UNIVERSAL" | "SERVICES";

export type AscBundleId = {
  type: "bundleIds";
  id: string;
  attributes: {
    identifier: string;
    name: string;
    platform: BundleIdPlatform;
    seedId?: string;
  };
};

export type AscBundleIdCapability = {
  type: "bundleIdCapabilities";
  id: string;
  attributes: { capabilityType: string };
};

export type AscApp = {
  type: "apps";
  id: string;
  attributes: {
    bundleId: string;
    name: string;
    sku?: string;
    primaryLocale?: string;
  };
};

type AscErrorEntry = {
  id?: string;
  status?: string;
  code?: string;
  title?: string;
  detail?: string;
  source?: { pointer?: string; parameter?: string };
};

type AscErrorBody = { errors: AscErrorEntry[] };

export class AscApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: string;
  readonly errors: AscErrorEntry[];
  readonly responseBody: string;
  constructor(status: number, body: string) {
    let parsed: AscErrorBody | null = null;
    try {
      parsed = JSON.parse(body) as AscErrorBody;
    } catch {
      parsed = null;
    }
    const first = parsed?.errors?.[0];
    super(
      first
        ? `ASC ${status} ${first.code ?? ""}: ${first.detail ?? first.title ?? body}`
        : `ASC ${status}: ${body}`,
    );
    this.name = "AscApiError";
    this.status = status;
    this.code = first?.code;
    this.detail = first?.detail ?? first?.title;
    this.errors = parsed?.errors ?? [];
    this.responseBody = body;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 15_000;

function encodeFilters(query?: Record<string, string | string[]>): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) for (const v of value) sp.append(key, v);
    else sp.append(key, value);
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export type AscClient = ReturnType<typeof makeAscClient>;

export function makeAscClient(creds: AscCredentials) {
  let cachedToken: { token: string; expiresAt: number } | null = null;
  const TTL_MARGIN_S = 60;

  async function token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.expiresAt - now > TTL_MARGIN_S) return cachedToken.token;
    cachedToken = await signAscToken(creds);
    return cachedToken.token;
  }

  async function fetchWithAuth(method: string, url: string, body?: unknown): Promise<Response> {
    let reSigned = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const t = await token();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ctl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          throw new AscApiError(0, `${method} ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw err;
      }
      clearTimeout(timer);
      if (res.status === 401 && !reSigned) {
        cachedToken = null;
        reSigned = true;
        continue;
      }
      if (RETRY_STATUSES.has(res.status)) {
        const ra = Number(res.headers.get("retry-after"));
        const delay =
          Number.isFinite(ra) && ra > 0 ? ra * 1000 : 250 * 2 ** attempt + Math.random() * 250;
        await sleep(delay);
        continue;
      }
      return res;
    }
    throw new AscApiError(429, `${method} ${url} → exhausted retries`);
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | string[]>,
  ): Promise<T> {
    const url = `${ASC_BASE}${path}${encodeFilters(query)}`;
    const res = await fetchWithAuth(method, url, body);
    const text = await res.text();
    if (!res.ok) throw new AscApiError(res.status, text);
    if (res.status === 204 || !text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async function paginatedList<T>(
    path: string,
    query?: Record<string, string | string[]>,
    limit = 200,
  ): Promise<T[]> {
    const out: T[] = [];
    let nextUrl: string | null =
      `${ASC_BASE}${path}${encodeFilters({ ...query, limit: String(limit) })}`;
    let safetyMax = 50;
    while (nextUrl && safetyMax-- > 0) {
      const res = await fetchWithAuth("GET", nextUrl);
      const text = await res.text();
      if (!res.ok) throw new AscApiError(res.status, text);
      const json = JSON.parse(text) as { data: T[]; links?: { next?: string } };
      out.push(...json.data);
      nextUrl = json.links?.next ?? null;
    }
    return out;
  }

  return {
    request,
    paginatedList,
    bundleIds: {
      list(filter?: { identifier?: string; platform?: BundleIdPlatform }): Promise<AscBundleId[]> {
        const query: Record<string, string> = {};
        if (filter?.identifier) query["filter[identifier]"] = filter.identifier;
        if (filter?.platform) query["filter[platform]"] = filter.platform;
        return paginatedList<AscBundleId>("/v1/bundleIds", query);
      },
      async create(args: {
        identifier: string;
        name: string;
        platform: BundleIdPlatform;
        seedId?: string;
      }): Promise<AscBundleId> {
        const body = {
          data: {
            type: "bundleIds",
            attributes: {
              identifier: args.identifier,
              name: args.name,
              platform: args.platform,
              ...(args.seedId ? { seedId: args.seedId } : {}),
            },
          },
        };
        const res = await request<{ data: AscBundleId }>("POST", "/v1/bundleIds", body);
        return res.data;
      },
    },

    bundleIdCapabilities: {
      async list(bundleIdResourceId: string): Promise<AscBundleIdCapability[]> {
        // Relationship endpoints don't accept a `limit` query param. Apple
        // tightened this validation, so skip paginatedList and fetch direct.
        // The capability list per bundle id is small enough that paging is moot.
        const res = await request<{ data: AscBundleIdCapability[] }>(
          "GET",
          `/v1/bundleIds/${bundleIdResourceId}/bundleIdCapabilities`,
        );
        return res.data;
      },
      async create(args: {
        bundleIdResourceId: string;
        capabilityType: string;
      }): Promise<AscBundleIdCapability> {
        const body = {
          data: {
            type: "bundleIdCapabilities",
            attributes: { capabilityType: args.capabilityType },
            relationships: {
              bundleId: {
                data: { type: "bundleIds", id: args.bundleIdResourceId },
              },
            },
          },
        };
        const res = await request<{ data: AscBundleIdCapability }>(
          "POST",
          "/v1/bundleIdCapabilities",
          body,
        );
        return res.data;
      },
    },

    apps: {
      async list(filter?: { bundleId?: string }): Promise<AscApp[]> {
        const query: Record<string, string> = {};
        if (filter?.bundleId) query["filter[bundleId]"] = filter.bundleId;
        return paginatedList<AscApp>("/v1/apps", query);
      },
      async get(id: string): Promise<AscApp> {
        const res = await request<{ data: AscApp }>("GET", `/v1/apps/${id}`);
        return res.data;
      },
    },
  };
}

export type ValidateResult =
  | { ok: true; appCount: number }
  | { ok: false; status: number; code?: string; reason: string };

export async function validate(creds: AscCredentials): Promise<ValidateResult> {
  try {
    const client = makeAscClient(creds);
    const apps = await client.apps.list();
    return { ok: true, appCount: apps.length };
  } catch (err) {
    if (err instanceof AscApiError) {
      // A 403 is "authenticated but forbidden" and has several causes; surface
      // Apple's actual code rather than guessing. A missing/expired agreement
      // (common after Apple updates the Developer Program License Agreement)
      // returns 403 for every endpoint regardless of key role.
      const reason =
        err.status === 401
          ? "invalid token (check keyId, issuerId, and .p8)"
          : err.status === 403
            ? err.code?.includes("REQUIRED_AGREEMENTS")
              ? "App Store Connect agreement missing or expired; the Account Holder must accept it in App Store Connect > Business (Agreements, Tax, and Banking)"
              : `forbidden${err.code ? ` (${err.code})` : ""}; if this is a permissions error the key needs App Manager role or higher`
            : (err.detail ?? `ASC ${err.status}`);
      return { ok: false, status: err.status, code: err.code, reason };
    }
    return { ok: false, status: 0, reason: err instanceof Error ? err.message : String(err) };
  }
}

export const SIGN_IN_WITH_APPLE_CAPABILITY = "APPLE_ID_AUTH";
