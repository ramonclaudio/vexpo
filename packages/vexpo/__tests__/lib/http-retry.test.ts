import { describe, expect, it } from "vitest";

import { MAX_RETRY_AFTER_MS, backoffMs, retryDelay } from "../../src/lib/http-retry.ts";

const res = (retryAfter?: string): Response =>
  new Response(
    null,
    retryAfter === undefined ? undefined : { headers: { "retry-after": retryAfter } },
  );

describe("backoffMs", () => {
  it("honors a positive Retry-After in seconds", () => {
    expect(backoffMs(res("2"), 5)).toBe(2000);
  });

  it("ignores a non-numeric or non-positive Retry-After and backs off exponentially", () => {
    for (const bad of ["abc", "0", "-1"]) {
      const ms = backoffMs(res(bad), 0);
      expect(ms).toBeGreaterThanOrEqual(250);
      expect(ms).toBeLessThan(500);
    }
  });

  it("grows the base delay as 250 * 2 ** attempt plus jitter under 250ms", () => {
    for (const attempt of [0, 1, 3]) {
      const base = 250 * 2 ** attempt;
      const ms = backoffMs(res(), attempt);
      expect(ms).toBeGreaterThanOrEqual(base);
      expect(ms).toBeLessThan(base + 250);
    }
  });
});

describe("retryDelay", () => {
  it("returns the backoff when it's within the cap", () => {
    expect(retryDelay(res("2"), 0)).toBe(2000);
  });

  it("returns null when Retry-After exceeds MAX_RETRY_AFTER_MS", () => {
    expect(retryDelay(res(String(MAX_RETRY_AFTER_MS / 1000 + 1)), 0)).toBeNull();
  });
});
