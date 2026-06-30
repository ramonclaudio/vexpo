import { beforeEach, describe, expect, it, vi } from "vitest";

// storage.ts installs a localStorage global from expo-sqlite at import time;
// stub the install side-effect and back it with an in-memory map for node.
vi.mock("expo-sqlite/localStorage/install", () => ({}));

const backing = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
  key: () => null,
  length: 0,
} as Storage;

import { createStorage } from "@/lib/storage";

beforeEach(() => backing.clear());

describe("createStorage", () => {
  it("returns the default until a value is written", () => {
    const store = createStorage<boolean>("k", false);
    expect(store.get()).toBe(false);
    store.set(true);
    expect(store.get()).toBe(true);
  });

  it("round-trips the boolean format the onboarding gate reads", () => {
    const store = createStorage<boolean>("onboarding_seen", false);
    store.set(true);
    expect(backing.get("onboarding_seen")).toBe("true");
    expect(store.get()).toBe(true);
  });

  it("notifies every subscriber on the same key so call sites stay in sync", () => {
    const layout = vi.fn();
    const welcome = vi.fn();
    const a = createStorage<boolean>("onboarding_seen", false);
    const b = createStorage<boolean>("onboarding_seen", false);
    a.subscribe(layout);
    b.subscribe(welcome);

    // welcome.markSeen() flips the one shared source; the layout sees it too.
    b.set(true);

    expect(welcome).toHaveBeenCalledTimes(1);
    expect(layout).toHaveBeenCalledTimes(1);
    expect(a.get()).toBe(true);
  });

  it("falls back to the default on malformed json", () => {
    backing.set("k", "{not json");
    const store = createStorage<string>("k", "fallback");
    expect(store.get()).toBe("fallback");
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const store = createStorage<boolean>("k", false);
    const off = store.subscribe(listener);
    off();
    store.set(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
