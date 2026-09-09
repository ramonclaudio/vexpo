import { afterEach, describe, expect, it, vi } from "vitest";

const ESC = String.fromCharCode(27);

// output.ts reads the stream and the environment once, at import, so each case needs a fresh copy.
async function loadOutput(opts: { isTTY: boolean; noColor?: string; term?: string }) {
  const original = process.stderr.isTTY;
  Object.defineProperty(process.stderr, "isTTY", { value: opts.isTTY, configurable: true });
  vi.stubEnv("NO_COLOR", opts.noColor);
  vi.stubEnv("TERM", opts.term ?? "xterm-256color");
  vi.resetModules();
  const mod = await import("../../src/lib/output.ts");
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

afterEach(() => vi.unstubAllEnvs());

describe("color", () => {
  it("writes escapes on a terminal", async () => {
    const { ok } = await loadOutput({ isTTY: true });
    expect(captureStderr(() => ok("linked"))).toContain(ESC);
  });

  it("writes none when NO_COLOR is set", async () => {
    const { ok } = await loadOutput({ isTTY: true, noColor: "1" });
    expect(captureStderr(() => ok("linked"))).toBe("  ok   linked\n");
  });

  it("writes none when stderr is not a terminal", async () => {
    const { ok } = await loadOutput({ isTTY: false });
    expect(captureStderr(() => ok("linked"))).toBe("  ok   linked\n");
  });

  it("keeps color when NO_COLOR is empty", async () => {
    const { ok } = await loadOutput({ isTTY: true, noColor: "" });
    expect(captureStderr(() => ok("linked"))).toContain(ESC);
  });

  it("writes none under TERM=dumb", async () => {
    const { ok } = await loadOutput({ isTTY: true, term: "dumb" });
    expect(captureStderr(() => ok("linked"))).toBe("  ok   linked\n");
  });
});

describe("section", () => {
  it("rules the title off on a terminal", async () => {
    const { section } = await loadOutput({ isTTY: true });
    expect(captureStderr(() => section("Convex"))).toContain("\u2500");
  });

  it("drops the rule when there is no color", async () => {
    const { section } = await loadOutput({ isTTY: false });
    expect(captureStderr(() => section("Convex"))).toBe("\nConvex\n");
  });
});

describe("severity without color", () => {
  it("keeps a text marker on every line", async () => {
    const { ok, bad, yep, nop } = await loadOutput({ isTTY: false });
    const out = captureStderr(() => {
      ok("done");
      bad("broke");
      yep("careful");
      nop("skipped");
    });
    expect(out).toBe("  ok   done\n  xx   broke\n  !!   careful\n  --   skipped\n");
  });
});
