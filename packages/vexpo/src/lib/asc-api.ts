import { signAscToken, type AscCredentials } from "./asc-jwt.ts";
import {
  REQUEST_TIMEOUT_MS,
  TimeoutError,
  fetchWithTimeout,
  retryDelay,
  sleep,
} from "./http-retry.ts";
import { errText } from "./output.ts";

const ASC_BASE = "https://api.appstoreconnect.apple.com";

export type { AscCredentials };

type BundleIdPlatform = "IOS" | "MAC_OS" | "UNIVERSAL" | "SERVICES";

export type AscBundleId = {
  type: "bundleIds";
  id: string;
  attributes: {
    identifier: string;
    name: string;
    platform: BundleIdPlatform;
  };
};

type AscBundleIdCapability = {
  type: "bundleIdCapabilities";
  id: string;
  attributes: { capabilityType: string };
};

type AscApp = { type: "apps"; id: string };

type AscErrorEntry = { code?: string; title?: string; detail?: string };

type AscErrorBody = { errors: AscErrorEntry[] };

function parseAscErrorBody(body: string): AscErrorBody | null {
  try {
    return JSON.parse(body) as AscErrorBody;
  } catch {
    return null;
  }
}

function ascErrorMessage(status: number, body: string, first?: AscErrorEntry): string {
  if (!first) return `App Store Connect ${status}: ${body}`;
  return `App Store Connect ${status} ${first.code ?? ""}: ${first.detail ?? first.title ?? body}`;
}

export class AscApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: string;
  constructor(status: number, body: string) {
    const first = parseAscErrorBody(body)?.errors?.[0];
    super(ascErrorMessage(status, body, first));
    this.name = "AscApiError";
    this.status = status;
    this.code = first?.code;
    this.detail = first?.detail ?? first?.title;
  }
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);

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
    let lastStatus = 0;
    let lastText = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const t = await token();
      let res: Response;
      try {
        res = await fetchWithTimeout(
          url,
          {
            method,
            headers: {
              Authorization: `Bearer ${t}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
          },
          REQUEST_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof TimeoutError) {
          throw new AscApiError(0, `${method} ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw err;
      }
      if (res.status === 401 && !reSigned) {
        cachedToken = null;
        reSigned = true;
        continue;
      }
      if (RETRY_STATUSES.has(res.status)) {
        lastStatus = res.status;
        lastText = await res.text();
        const delay = retryDelay(res, attempt);
        if (delay === null || attempt === 4) break;
        await sleep(delay);
        continue;
      }
      return res;
    }
    throw new AscApiError(lastStatus, lastText);
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
  ): Promise<T[]> {
    const out: T[] = [];
    let nextUrl: string | null = `${ASC_BASE}${path}${encodeFilters({ ...query, limit: "200" })}`;
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
      list(filter: { identifier: string }): Promise<AscBundleId[]> {
        return paginatedList<AscBundleId>("/v1/bundleIds", {
          "filter[identifier]": filter.identifier,
        });
      },
      async create(args: { identifier: string; name: string }): Promise<AscBundleId> {
        const body = { data: { type: "bundleIds", attributes: { ...args, platform: "IOS" } } };
        const res = await request<{ data: AscBundleId }>("POST", "/v1/bundleIds", body);
        return res.data;
      },
    },

    bundleIdCapabilities: {
      async list(bundleIdResourceId: string): Promise<AscBundleIdCapability[]> {
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
    },
  };
}

type ValidateResult = { ok: true; appCount: number } | { ok: false; reason: string };

export async function validate(creds: AscCredentials): Promise<ValidateResult> {
  try {
    const client = makeAscClient(creds);
    const apps = await client.apps.list();
    return { ok: true, appCount: apps.length };
  } catch (err) {
    if (err instanceof AscApiError) {
      const reason =
        err.status === 401
          ? "invalid token (check keyId, issuerId, and .p8)"
          : err.status === 403
            ? err.code?.includes("REQUIRED_AGREEMENTS")
              ? "App Store Connect agreement missing or expired. The Account Holder has to accept it in App Store Connect under Business, then Agreements, Tax, and Banking"
              : `forbidden${err.code ? ` (${err.code})` : ""}. The key needs the App Manager role or higher`
            : (err.detail ?? `App Store Connect ${err.status}`);
      return { ok: false, reason };
    }
    return { ok: false, reason: errText(err) };
  }
}

export const SIGN_IN_WITH_APPLE_CAPABILITY = "APPLE_ID_AUTH";
