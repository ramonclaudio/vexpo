const BASE = "https://api.resend.com";

export type ResendDomain = { id: string; name: string; status: string };
export type ResendApiKey = { id: string; name: string; created_at?: string };
export type ResendWebhook = {
  id: string;
  endpoint: string;
  events?: string[];
  status: string;
};

export type ResendDomainRecord = {
  record: string;
  name: string;
  type: string;
  ttl?: string | number;
  status?: string;
  value: string;
  priority?: number;
};

export type ResendDomainDetail = {
  id: string;
  name: string;
  status: string;
  region?: string;
  records: ResendDomainRecord[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REQUEST_TIMEOUT_MS = 15_000;

async function call<T>(method: string, path: string, key: string, body?: unknown): Promise<T> {
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Resend ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`, {
          cause: err,
        });
      }
      throw err;
    }
    clearTimeout(timer);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Resend ${method} ${path} → ${res.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }
  throw new Error(`Resend ${method} ${path} → 429 after retries`);
}

export async function probeAccess(key: string): Promise<"full" | "sending" | "invalid"> {
  // Bound the gating probe like every other Resend call (see `call`), so a
  // silent network stall can't hang `vexpo resend` forever. Can't route through
  // `call` because that throws on non-2xx; we need the 4xx body to tell a
  // restricted key from an invalid one.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api-keys`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctl.signal,
    });
    if (res.ok) return "full";
    const text = await res.text();
    if (text.includes("restricted_api_key")) return "sending";
    return "invalid";
  } finally {
    clearTimeout(timer);
  }
}

export async function listDomains(key: string): Promise<ResendDomain[]> {
  return (await call<{ data: ResendDomain[] }>("GET", "/domains", key)).data;
}

export async function getDomain(key: string, id: string): Promise<ResendDomainDetail> {
  return call<ResendDomainDetail>("GET", `/domains/${id}`, key);
}

export async function verifyDomain(key: string, id: string): Promise<void> {
  await call("POST", `/domains/${id}/verify`, key);
}

export async function listApiKeys(key: string): Promise<ResendApiKey[]> {
  return (await call<{ data: ResendApiKey[] }>("GET", "/api-keys", key)).data;
}

export async function createApiKey(
  key: string,
  args: {
    name: string;
    permission?: "full_access" | "sending_access";
    domain_id?: string;
  },
): Promise<{ id: string; token: string }> {
  return call("POST", "/api-keys", key, args);
}

export async function deleteApiKey(key: string, id: string): Promise<void> {
  await call("DELETE", `/api-keys/${id}`, key);
}

export async function listWebhooks(key: string): Promise<ResendWebhook[]> {
  return (await call<{ data: ResendWebhook[] }>("GET", "/webhooks", key)).data;
}

export async function createWebhook(
  key: string,
  args: { endpoint: string; events: string[] },
): Promise<{ id: string; signing_secret: string }> {
  return call("POST", "/webhooks", key, args);
}

export async function deleteWebhook(key: string, id: string): Promise<void> {
  await call("DELETE", `/webhooks/${id}`, key);
}

export const RESEND_TRANSACTIONAL_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.opened",
  "email.clicked",
] as const;

export async function provisionSendingKey(
  fullKey: string,
  name: string,
  domainId: string,
): Promise<string> {
  for (const stale of (await listApiKeys(fullKey)).filter((k) => k.name === name)) {
    await deleteApiKey(fullKey, stale.id);
  }
  const created = await createApiKey(fullKey, {
    name,
    permission: "sending_access",
    domain_id: domainId,
  });
  return created.token;
}

/**
 * Deletes any existing webhook pointing at this endpoint, then creates a fresh
 * one. Returns the new webhook id + signing secret (Resend only returns the
 * secret at creation, so the id lets callers record which webhook the stored
 * RESEND_WEBHOOK_SECRET belongs to for later drift detection).
 */
export async function provisionWebhook(
  fullKey: string,
  endpoint: string,
  events: readonly string[] = RESEND_TRANSACTIONAL_EVENTS,
): Promise<{ id: string; secret: string }> {
  for (const stale of (await listWebhooks(fullKey)).filter((w) => w.endpoint === endpoint)) {
    await deleteWebhook(fullKey, stale.id);
  }
  const created = await createWebhook(fullKey, { endpoint, events: [...events] });
  return { id: created.id, secret: created.signing_secret };
}
