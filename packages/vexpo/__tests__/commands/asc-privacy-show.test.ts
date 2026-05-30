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

  it("renders the declared local config", async () => {
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
    expect(await runPrivacyShow("p.json")).toBe(0);
  });

  it("returns 1 on malformed JSON", async () => {
    existsSpy.mockReturnValue(true);
    readSpy.mockReturnValue("{not json");
    expect(await runPrivacyShow("p.json")).toBe(1);
  });
});
