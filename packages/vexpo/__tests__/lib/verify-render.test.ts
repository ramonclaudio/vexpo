import { afterEach, describe, expect, it, vi } from "vitest";

import type { Check } from "../../src/lib/verify.ts";

// output.ts reads the stream and the environment once, at import, so this needs a fresh copy.
async function loadRender(isTTY: boolean) {
  const original = process.stderr.isTTY;
  Object.defineProperty(process.stderr, "isTTY", { value: isTTY, configurable: true });
  vi.stubEnv("NO_COLOR", undefined);
  vi.stubEnv("TERM", "xterm-256color");
  vi.resetModules();
  const mod = await import("../../src/lib/verify-render.ts");
  Object.defineProperty(process.stderr, "isTTY", { value: original, configurable: true });
  return mod;
}

function captureStderr(run: () => void): string {
  let out = "";
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return out;
}

const checks: Check[] = (
  [
    ["ok", "convex url", "set"],
    ["warn", "resend key", "missing in prod"],
    ["fail", "apple key", "not found"],
    ["skip", "eas project", "not checked"],
  ] as const
).map(([severity, name, message]) => ({
  category: "files",
  severity,
  name,
  message,
}));

afterEach(() => vi.unstubAllEnvs());

describe("renderVerifyResults", () => {
  it("tags every severity in words when there is no color", async () => {
    const { renderVerifyResults } = await loadRender(false);
    const out = captureStderr(() => renderVerifyResults(checks, "compact"));
    expect(out).toContain("ok convex url");
    expect(out).toContain("!! resend key");
    expect(out).toContain("xx apple key");
    expect(out).toContain("-- eas project");
  });

  it("carries no check mark or ballot x", async () => {
    const { renderVerifyResults } = await loadRender(false);
    const out = captureStderr(() => renderVerifyResults(checks, "section"));
    expect(out).not.toMatch(/[✓✗✔✘]/);
  });

  it.each(["section", "compact"] as const)(
    "lines the details up under the name in %s",
    async (style) => {
      const { renderVerifyResults } = await loadRender(false);
      const out = captureStderr(() =>
        renderVerifyResults([{ ...checks[0], details: "from .env.local" }], style),
      );
      const [head, details] = out
        .split("\n")
        .filter((l) => l.trim())
        .slice(-2);
      expect(details.indexOf("from")).toBe(head.indexOf("convex url") + 2);
    },
  );

  it("still writes the name and the message", async () => {
    const { renderVerifyResults } = await loadRender(false);
    const out = captureStderr(() => renderVerifyResults(checks, "section"));
    for (const c of checks) {
      expect(out).toContain(c.name);
      expect(out).toContain(c.message);
    }
  });
});
