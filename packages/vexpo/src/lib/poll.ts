import { sleep } from "./http-retry.ts";

type PollResult<T> =
  | { done: true; value: T; attempts: number; elapsedMs: number }
  | { done: false; attempts: number; elapsedMs: number };

export async function poll<T>(opts: {
  check: () => Promise<{ done: true; value: T } | { done: false; reason?: string }>;
  intervalMs: number;
  timeoutMs: number;
  tick: (state: { attempts: number; elapsedMs: number; reason?: string }) => void;
}): Promise<PollResult<T>> {
  const start = Date.now();
  let attempts = 0;

  for (;;) {
    attempts += 1;
    const res = await opts.check();
    const elapsedMs = Date.now() - start;
    if (res.done) return { done: true, value: res.value, attempts, elapsedMs };
    opts.tick({ attempts, elapsedMs, reason: res.reason });
    if (elapsedMs + opts.intervalMs > opts.timeoutMs) return { done: false, attempts, elapsedMs };
    await sleep(opts.intervalMs);
  }
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}
