/**
 * Shared HTTP timeout + backoff primitives for the ASC and Resend clients.
 * Each client keeps its own auth and error mapping; only the retry mechanics
 * live here.
 */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const REQUEST_TIMEOUT_MS = 15_000;

export class TimeoutError extends Error {}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new TimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Honored Retry-After in ms, else jittered exponential backoff
 * (`250 * 2 ** attempt`).
 */
export function backoffMs(res: Response, attempt: number): number {
  const ra = Number(res.headers.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return ra * 1000;
  return 250 * 2 ** attempt + Math.random() * 250;
}

export const MAX_RETRY_AFTER_MS = 30_000;

/**
 * Backoff to sleep before the next attempt, or null when it exceeds
 * MAX_RETRY_AFTER_MS. A server can send a minute-plus Retry-After that would
 * hang the CLI, so callers bail loudly with the real error on null instead.
 */
export function retryDelay(res: Response, attempt: number): number | null {
  const delay = backoffMs(res, attempt);
  return delay > MAX_RETRY_AFTER_MS ? null : delay;
}
