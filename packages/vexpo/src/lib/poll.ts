/**
 * Polling primitive for async-wait gates.
 *
 * Calls `check()` every `intervalMs` until it returns `{ done: true }` or
 * total elapsed exceeds `timeoutMs`. Optionally calls `tick()` per attempt
 * (e.g. to print a progress dot or update a status line).
 *
 * Returns:
 *   - `{ done: true, attempts, elapsedMs, value }` on success
 *   - `{ done: false, attempts, elapsedMs }` on timeout
 */

export type PollResult<T> =
  | { done: true; value: T; attempts: number; elapsedMs: number }
  | { done: false; attempts: number; elapsedMs: number };

export async function poll<T>(opts: {
  check: () => Promise<{ done: true; value: T } | { done: false; reason?: string }>;
  intervalMs?: number;
  timeoutMs?: number;
  tick?: (state: { attempts: number; elapsedMs: number; reason?: string }) => void;
}): Promise<PollResult<T>> {
  const intervalMs = opts.intervalMs ?? 30_000;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const start = Date.now();
  let attempts = 0;

  for (;;) {
    attempts += 1;
    const elapsedMs = Date.now() - start;
    const res = await opts.check();
    if (res.done) {
      return { done: true, value: res.value, attempts, elapsedMs };
    }
    opts.tick?.({ attempts, elapsedMs, reason: res.reason });
    if (elapsedMs + intervalMs > timeoutMs) {
      return { done: false, attempts, elapsedMs };
    }
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}
