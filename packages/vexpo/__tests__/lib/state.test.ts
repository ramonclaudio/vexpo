import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  STATE_FILE,
  appendAudit,
  checkConcurrentRun,
  clearAll,
  clearStep,
  fingerprint,
  isStepFresh,
  load,
  recordStep,
  save,
  verifyOrInvalidate,
  type SetupState,
} from "../../src/lib/state";

let originalCwd: string;
let workdir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "state-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("state load/save round-trip", () => {
  it("returns empty state when file is absent", async () => {
    const state = await load();
    expect(state.steps).toEqual({});
    expect(state.audit).toEqual([]);
  });

  it("round-trips a saved state", async () => {
    const state = await load();
    state.steps.convex = {
      name: "convex",
      completedAt: "2026-05-03T00:00:00.000Z",
      verifyAt: "2026-05-03T00:00:00.000Z",
      outputs: { deployment: "happy-frog-123" },
    };
    await save(state);
    const reloaded = await load();
    expect(reloaded.steps.convex?.outputs).toEqual({ deployment: "happy-frog-123" });
  });

  it("rejects malformed JSON", async () => {
    await writeFile(STATE_FILE, "{ not valid");
    await expect(load()).rejects.toThrow(/invalid JSON/);
  });

  it("rejects an array (typeof is object but shape is wrong)", async () => {
    await writeFile(STATE_FILE, "[]");
    await expect(load()).rejects.toThrow(/is an array, expected object/);
  });

  it("rejects null", async () => {
    await writeFile(STATE_FILE, "null");
    await expect(load()).rejects.toThrow(/empty or null/);
  });

  it("normalizes a hand-edited `{}` to a usable state", async () => {
    await writeFile(STATE_FILE, "{}");
    const state = await load();
    expect(state.steps).toEqual({});
    expect(state.audit).toEqual([]);
    expect(state.lastPid).toBe(0);
    expect(typeof state.createdAt).toBe("string");
    expect(typeof state.updatedAt).toBe("string");
  });

  it("normalizes a state missing `steps`", async () => {
    await writeFile(STATE_FILE, JSON.stringify({ createdAt: "2026-01-01T00:00:00.000Z" }));
    const state = await load();
    expect(state.steps).toEqual({});
    expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("normalizes a state with non-array `audit`", async () => {
    await writeFile(STATE_FILE, JSON.stringify({ steps: {}, audit: "not-an-array" }));
    const state = await load();
    expect(state.audit).toEqual([]);
  });

  it("normalizes a state with non-numeric `lastPid`", async () => {
    await writeFile(STATE_FILE, JSON.stringify({ lastPid: "not-a-number" }));
    const state = await load();
    expect(state.lastPid).toBe(0);
  });

  it("tolerates extra unknown fields (forward-compat)", async () => {
    await writeFile(
      STATE_FILE,
      JSON.stringify({
        schemaVersion: 99,
        steps: { convex: { name: "convex", completedAt: "x", verifyAt: "x" } },
        audit: [],
        unknownFutureKey: { foo: "bar" },
      }),
    );
    const state = await load();
    expect(state.steps.convex?.completedAt).toBe("x");
  });

  it("rejects a state file that is a directory with a clear error", async () => {
    await mkdir(STATE_FILE, { recursive: true });
    await expect(load()).rejects.toThrow(/is a directory/);
  });

  it("handles a state file that is a symlink to /dev/null", async () => {
    await symlink("/dev/null", STATE_FILE);
    // /dev/null reads as empty → JSON.parse fails → wrapped with "invalid JSON".
    await expect(load()).rejects.toThrow(/invalid JSON/);
  });
});

describe("recordStep / clearStep", () => {
  it("records a step with verifyAt set to now", async () => {
    await recordStep("convex", { deployment: "x" });
    const state = await load();
    const rec = state.steps.convex;
    expect(rec?.completedAt).toBeTruthy();
    expect(rec?.verifyAt).toBe(rec?.completedAt);
    expect(rec?.outputs).toEqual({ deployment: "x" });
  });

  it("clears a single step without affecting others", async () => {
    await recordStep("convex");
    await recordStep("better-auth");
    await clearStep("convex");
    const state = await load();
    expect(state.steps.convex).toBeUndefined();
    expect(state.steps["better-auth"]).toBeDefined();
  });
});

describe("clearAll", () => {
  it("removes the state file", async () => {
    await recordStep("convex");
    await clearAll();
    await expect(access(STATE_FILE)).rejects.toThrow();
  });

  it("is a no-op when file is absent", async () => {
    await expect(clearAll()).resolves.toBeUndefined();
  });
});

describe("audit log", () => {
  it("appends and caps at 50 entries", async () => {
    for (let i = 0; i < 55; i++) {
      await appendAudit({
        invokedAt: new Date().toISOString(),
        args: [`run-${i}`],
        pid: i,
        bunVersion: "test",
        cwd: workdir,
        completed: [],
        skipped: [],
      });
    }
    const state = await load();
    expect(state.audit.length).toBe(50);
    expect(state.audit[0].pid).toBe(5);
    expect(state.audit[49].pid).toBe(54);
  });
});

describe("isStepFresh", () => {
  function fakeState(verifyAt: string): SetupState {
    return {
      createdAt: verifyAt,
      updatedAt: verifyAt,
      lastPid: 0,
      steps: { convex: { name: "convex", completedAt: verifyAt, verifyAt } },
      audit: [],
    };
  }

  it("returns true when within ttl", () => {
    const state = fakeState(new Date(Date.now() - 60_000).toISOString());
    expect(isStepFresh(state, "convex", 1)).toBe(true);
  });

  it("returns false when past ttl", () => {
    const state = fakeState(new Date(Date.now() - 2 * 3_600_000).toISOString());
    expect(isStepFresh(state, "convex", 1)).toBe(false);
  });

  it("returns true for ttl=Infinity", () => {
    const state = fakeState(new Date(Date.now() - 365 * 86_400_000).toISOString());
    expect(isStepFresh(state, "convex", Infinity)).toBe(true);
  });

  it("returns false for absent step", () => {
    const state = fakeState(new Date().toISOString());
    expect(isStepFresh(state, "resend", 1)).toBe(false);
  });
});

describe("verifyOrInvalidate", () => {
  it("clears the step when verify returns ok=false", async () => {
    await recordStep("convex");
    const ok = await verifyOrInvalidate("convex", async () => ({ ok: false, reason: "drift" }));
    expect(ok).toBe(false);
    const state = await load();
    expect(state.steps.convex).toBeUndefined();
  });

  it("refreshes verifyAt when verify returns ok=true", async () => {
    await recordStep("convex");
    const before = (await load()).steps.convex?.verifyAt;
    await new Promise((r) => setTimeout(r, 10));
    const ok = await verifyOrInvalidate("convex", async () => ({ ok: true }));
    expect(ok).toBe(true);
    const after = (await load()).steps.convex?.verifyAt;
    expect(after).not.toBe(before);
  });
});

describe("checkConcurrentRun", () => {
  it("flags a stale write from a different pid", () => {
    const state: SetupState = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastPid: process.pid + 1,
      steps: {},
      audit: [],
    };
    const result = checkConcurrentRun(state);
    expect(result.stale).toBe(false);
    expect(result.otherPid).toBe(process.pid + 1);
  });

  it("ignores writes older than the warn window", () => {
    const state: SetupState = {
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      lastPid: process.pid + 1,
      steps: {},
      audit: [],
    };
    expect(checkConcurrentRun(state).stale).toBe(true);
  });

  it("ignores writes from the same pid", () => {
    const state: SetupState = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastPid: process.pid,
      steps: {},
      audit: [],
    };
    expect(checkConcurrentRun(state).stale).toBe(true);
  });
});

describe("lookupCachedPath", () => {
  it("returns the value when the file exists", async () => {
    const { lookupCachedPath } = await import("../../src/lib/state");
    const fixturePath = path.join(workdir, "fixture.p8");
    await writeFile(fixturePath, "fake p8 contents");
    await recordStep("apple-sign-in", { p8Path: fixturePath });
    const out = await lookupCachedPath(await load(), ["apple-sign-in"], "p8Path");
    expect(out).toBe(fixturePath);
  });

  it("returns null when the cached file no longer exists", async () => {
    const { lookupCachedPath } = await import("../../src/lib/state");
    await recordStep("apple-sign-in", { p8Path: path.join(workdir, "missing.p8") });
    const out = await lookupCachedPath(await load(), ["apple-sign-in"], "p8Path");
    expect(out).toBeNull();
  });

  it("falls through multiple steps in order", async () => {
    const { lookupCachedPath } = await import("../../src/lib/state");
    const fixturePath = path.join(workdir, "fixture.p8");
    await writeFile(fixturePath, "x");
    await recordStep("apple-sign-in", { p8Path: path.join(workdir, "missing-1.p8") });
    await recordStep("asc-key", { p8Path: fixturePath });
    const out = await lookupCachedPath(await load(), ["apple-sign-in", "asc-key"], "p8Path");
    expect(out).toBe(fixturePath);
  });

  it("returns null when no step has the key", async () => {
    const { lookupCachedPath } = await import("../../src/lib/state");
    const out = await lookupCachedPath(await load(), ["apple-sign-in"], "p8Path");
    expect(out).toBeNull();
  });
});

describe("fingerprint", () => {
  it("is deterministic and discriminates between inputs", () => {
    expect(fingerprint("hello")).toBe(fingerprint("hello"));
    expect(fingerprint("hello")).not.toBe(fingerprint("world"));
  });
});
