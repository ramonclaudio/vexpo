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

export function backoffMs(res: Response, attempt: number): number {
  const ra = Number(res.headers.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return ra * 1000;
  return 250 * 2 ** attempt + Math.random() * 250;
}

export const MAX_RETRY_AFTER_MS = 30_000;

export function retryDelay(res: Response, attempt: number): number | null {
  const delay = backoffMs(res, attempt);
  return delay > MAX_RETRY_AFTER_MS ? null : delay;
}
