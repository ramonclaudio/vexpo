import { describe, expect, it } from "vitest";

import { resolveTeamIdInput } from "../../src/commands/convex.ts";

describe("resolveTeamIdInput", () => {
  it("empty input with no app.config fallback skips (lite has no Apple account)", () => {
    expect(resolveTeamIdInput("", null)).toEqual({ kind: "skip" });
    expect(resolveTeamIdInput("   ", null)).toEqual({ kind: "skip" });
  });

  it("empty input falls back to app.config.ts team id", () => {
    expect(resolveTeamIdInput("", "ABCDE12345")).toEqual({ kind: "ok", value: "ABCDE12345" });
  });

  it("typed input wins over the fallback and is uppercased", () => {
    expect(resolveTeamIdInput("abcde12345", "ZZZZZ99999")).toEqual({
      kind: "ok",
      value: "ABCDE12345",
    });
  });

  it("garbage input is invalid, not skipped", () => {
    expect(resolveTeamIdInput("not-a-team", null)).toEqual({
      kind: "invalid",
      value: "NOT-A-TEAM",
    });
    expect(resolveTeamIdInput("SHORT", null)).toEqual({ kind: "invalid", value: "SHORT" });
  });

  it("an invalid app.config fallback is reported, not silently skipped", () => {
    expect(resolveTeamIdInput("", "bad")).toEqual({ kind: "invalid", value: "bad" });
  });
});
