import { afterEach, describe, expect, it, vi } from "vitest";

const ESC = String.fromCharCode(27);
const CR = String.fromCharCode(13);

function withStderr(
  opts: { isTTY: boolean; noColor?: string; term?: string },
  run: (mod: typeof import("../src/tty.ts")) => Promise<void> | void,
): Promise<string> {
  const original = process.stderr.isTTY;
  Object.defineProperty(process.stderr, "isTTY", { value: opts.isTTY, configurable: true });
  vi.stubEnv("NO_COLOR", opts.noColor);
  vi.stubEnv("TERM", opts.term ?? "xterm-256color");
  let out = "";
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  return (async () => {
    try {
      vi.resetModules();
      await run(await import("../src/tty.ts"));
    } finally {
      spy.mockRestore();
      Object.defineProperty(process.stderr, "isTTY", { value: original, configurable: true });
    }
    return out;
  })();
}

const spin = (mod: typeof import("../src/tty.ts")) => {
  mod.spinner("Installing dependencies").succeed("Installed with npm");
};

afterEach(() => vi.unstubAllEnvs());

describe("spinner", () => {
  it("animates on a terminal", async () => {
    const out = await withStderr({ isTTY: true }, spin);
    expect(out).toContain(CR);
    expect(out).toContain("⠋");
  });

  it("writes one plain line when NO_COLOR is set", async () => {
    const out = await withStderr({ isTTY: true, noColor: "1" }, spin);
    expect(out).toBe("Installing dependencies\nok Installed with npm\n");
  });

  it("writes one plain line under TERM=dumb", async () => {
    const out = await withStderr({ isTTY: true, term: "dumb" }, spin);
    expect(out).not.toContain(CR);
    expect(out).not.toContain(ESC);
  });

  it("writes one plain line off a terminal", async () => {
    const out = await withStderr({ isTTY: false }, spin);
    expect(out).toBe("Installing dependencies\nok Installed with npm\n");
  });

  it("keeps a distinct mark on every outcome", async () => {
    const out = await withStderr({ isTTY: false }, (mod) => {
      mod.spinner("a").succeed("done");
      mod.spinner("b").fail("broke");
      mod.spinner("c").warn("careful");
    });
    expect(out).toContain("ok done");
    expect(out).toContain("xx broke");
    expect(out).toContain("!! careful");
  });
});
