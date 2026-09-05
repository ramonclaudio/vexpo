import { afterEach, describe, expect, it, vi } from "vitest";

const ESC = String.fromCharCode(27);

// output.ts reads the stream and the environment once, at import, so each case
// sets both and then loads a fresh copy of the module.
async function loadOutput(opts: { isTTY: boolean; noColor?: string }) {
  const original = process.stderr.isTTY;
  Object.defineProperty(process.stderr, "isTTY", { value: opts.isTTY, configurable: true });
  if (opts.noColor === undefined) vi.stubEnv("NO_COLOR", undefined);
  else vi.stubEnv("NO_COLOR", opts.noColor);
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

describe("colour", () => {
  it("writes escapes on a terminal", async () => {
    const { ok } = await loadOutput({ isTTY: true });
    expect(captureStderr(() => ok("linked"))).toContain(ESC);
  });

  // NO_COLOR is the cross-tool opt-out, and a run piped to a file or read back
  // by a screen reader should not have escapes in it either.
  it("writes none when NO_COLOR is set", async () => {
    const { ok } = await loadOutput({ isTTY: true, noColor: "1" });
    expect(captureStderr(() => ok("linked"))).toBe("  ok   linked\n");
  });

  it("writes none when stderr is not a terminal", async () => {
    const { ok } = await loadOutput({ isTTY: false });
    expect(captureStderr(() => ok("linked"))).toBe("  ok   linked\n");
  });

  // An empty NO_COLOR is the same as unset, which is what the convention says.
  it("keeps colour when NO_COLOR is empty", async () => {
    const { ok } = await loadOutput({ isTTY: true, noColor: "" });
    expect(captureStderr(() => ok("linked"))).toContain(ESC);
  });
});

describe("severity without colour", () => {
  // Nothing may depend on colour alone: each line keeps its two-character tag.
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
