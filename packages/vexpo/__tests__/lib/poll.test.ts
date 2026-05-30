import { describe, expect, it, vi } from "vitest";

import { formatElapsed, poll } from "../../src/lib/poll";

describe("poll", () => {
  it("returns done: true with the value on first success", async () => {
    let calls = 0;
    const result = await poll<string>({
      check: async () => {
        calls += 1;
        return { done: true, value: "got it" };
      },
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result.done).toBe(true);
    if (result.done) expect(result.value).toBe("got it");
    expect(result.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it("retries until success", async () => {
    let calls = 0;
    const result = await poll<number>({
      check: async () => {
        calls += 1;
        if (calls < 3) return { done: false, reason: `attempt ${calls}` };
        return { done: true, value: calls };
      },
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result.done).toBe(true);
    if (result.done) expect(result.value).toBe(3);
    expect(result.attempts).toBe(3);
  });

  it("returns done: false on timeout", async () => {
    const result = await poll<string>({
      check: async () => ({ done: false }),
      intervalMs: 10,
      timeoutMs: 30,
    });
    expect(result.done).toBe(false);
    expect(result.attempts).toBeGreaterThanOrEqual(1);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("calls tick on every failed check", async () => {
    const tick = vi.fn();
    let calls = 0;
    await poll({
      check: async () => {
        calls += 1;
        if (calls < 3) return { done: false, reason: `n${calls}` };
        return { done: true, value: null };
      },
      intervalMs: 1,
      timeoutMs: 1000,
      tick,
    });
    expect(tick).toHaveBeenCalledTimes(2);
    expect(tick).toHaveBeenCalledWith(expect.objectContaining({ reason: "n1" }));
    expect(tick).toHaveBeenCalledWith(expect.objectContaining({ reason: "n2" }));
  });

  it("does NOT call tick on successful attempts", async () => {
    const tick = vi.fn();
    await poll({
      check: async () => ({ done: true, value: 1 }),
      intervalMs: 1,
      timeoutMs: 100,
      tick,
    });
    expect(tick).not.toHaveBeenCalled();
  });

  it("propagates check() exceptions", async () => {
    await expect(
      poll({
        check: async () => {
          throw new Error("check exploded");
        },
        intervalMs: 1,
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/check exploded/);
  });

  it("returns elapsedMs that's monotonically increasing across attempts", async () => {
    let lastElapsed = -1;
    const result = await poll<number>({
      check: async () => {
        return { done: false };
      },
      intervalMs: 5,
      timeoutMs: 30,
      tick: ({ elapsedMs }) => {
        expect(elapsedMs).toBeGreaterThanOrEqual(lastElapsed);
        lastElapsed = elapsedMs;
      },
    });
    expect(result.done).toBe(false);
  });

  it("defaults to a 30s interval and a 30-minute timeout when unset", async () => {
    // Fake timers pin the real default values. An immediate-success poll never
    // reaches the interval/timeout code, so it can't catch a regression in them.
    vi.useFakeTimers();
    try {
      const check = vi.fn(async () => ({ done: false as const }));
      let settled = false;
      const p = poll({ check }).then((r) => {
        settled = true;
        return r;
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(check).toHaveBeenCalledTimes(1); // immediate first attempt

      await vi.advanceTimersByTimeAsync(29_999);
      expect(check).toHaveBeenCalledTimes(1); // no re-check before the 30s default

      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2); // re-checks at exactly 30s -> pins interval

      await vi.advanceTimersByTimeAsync(29 * 60_000);
      expect(settled).toBe(false); // still polling before the 30-min default timeout

      await vi.advanceTimersByTimeAsync(60_000);
      const result = await p;
      expect(result.done).toBe(false); // times out at the 30-min default
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatElapsed", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(500)).toBe("1s"); // rounds up at 0.5s
    expect(formatElapsed(15_000)).toBe("15s");
    expect(formatElapsed(59_000)).toBe("59s");
  });

  it("formats minute durations as MmSSs", () => {
    expect(formatElapsed(60_000)).toBe("1m00s");
    expect(formatElapsed(90_000)).toBe("1m30s");
    expect(formatElapsed(3_660_000)).toBe("61m00s");
  });

  it("zero-pads single-digit seconds in minute durations", () => {
    expect(formatElapsed(61_000)).toBe("1m01s");
    expect(formatElapsed(125_000)).toBe("2m05s");
  });
});
