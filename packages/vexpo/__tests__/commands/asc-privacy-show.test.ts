import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));

import { existsSync, readFileSync } from "node:fs";

import { runPrivacyShow } from "../../src/commands/asc-privacy.ts";

const existsSpy = existsSync as unknown as ReturnType<typeof vi.fn>;
const readSpy = readFileSync as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("runPrivacyShow (local, no ASC API)", () => {
  it("missing config returns 0 with guidance, never reads a file or hits the API", async () => {
    existsSpy.mockReturnValue(false);
    expect(await runPrivacyShow("nope.json")).toBe(0);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("renders each entry: category plus the tracking/linked/purpose flags", async () => {
    existsSpy.mockReturnValue(true);
    readSpy.mockReturnValue(
      JSON.stringify({
        collectsData: true,
        entries: [
          {
            category: "LOCATION",
            usedForTracking: true,
            linkedToUser: false,
            purposes: ["ANALYTICS"],
          },
        ],
      }),
    );
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(await runPrivacyShow("p.json")).toBe(0);
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();
    expect(out).toContain("LOCATION");
    expect(out).toContain("tracking · ANALYTICS");
    expect(out).not.toContain("linked");
  });

  it("returns 1 on malformed JSON", async () => {
    existsSpy.mockReturnValue(true);
    readSpy.mockReturnValue("{not json");
    expect(await runPrivacyShow("p.json")).toBe(1);
  });
});
