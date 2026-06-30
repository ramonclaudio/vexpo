import { describe, expect, it } from "vitest";

import { resolveDestination } from "../../src/commands/env/push.ts";
import type { Destination } from "../../src/lib/env-files.ts";

const convexDev: Destination = { type: "convex", channel: "dev", key: "BETTER_AUTH_SECRET" };

const base = {
  convexDev: new Map<string, string>(),
  convexProd: new Map<string, string>(),
  easByEnv: {
    development: new Map<string, string>(),
    preview: new Map<string, string>(),
    production: new Map<string, string>(),
  },
  hasEasProject: true,
};

describe("resolveDestination convex read failure", () => {
  // A null convex map means the env read failed (auth/CLI). It must block, not
  // fall through to "create" and blindly overwrite the whole deployment.
  it("blocks when the dev convex map is null", () => {
    const r = resolveDestination(convexDev, "new", { ...base, convexDev: null });
    expect(r.status).toBe("blocked");
    expect(r.reason).toMatch(/couldn't read convex env/);
  });

  it("creates (not blocks) when the read succeeded but the key is absent", () => {
    const r = resolveDestination(convexDev, "new", base);
    expect(r.status).toBe("create");
  });

  it("noops when the read succeeded and the value already matches", () => {
    const remote = { ...base, convexDev: new Map([["BETTER_AUTH_SECRET", "new"]]) };
    expect(resolveDestination(convexDev, "new", remote).status).toBe("noop");
  });
});
