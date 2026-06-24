import { describe, expect, it } from "vitest";

import { planConvexDev } from "../../src/commands/convex.ts";

describe("planConvexDev", () => {
  it("never emits the deprecated --local flag", () => {
    for (const local of [true, false]) {
      for (const fresh of [true, false]) {
        expect(planConvexDev({ local }, fresh, "app").devArgs).not.toContain("--local");
      }
    }
  });

  it("connect (existing, cloud): plain dev, no provisioning flags", () => {
    const p = planConvexDev({ local: false }, false, "app");
    expect(p.selectLocalFirst).toBe(false);
    expect(p.devArgs).toEqual(["convex", "dev", "--once", "--tail-logs", "disable"]);
  });

  it("fresh cloud: provisions with --dev-deployment cloud", () => {
    const p = planConvexDev({ local: false }, true, "app");
    expect(p.selectLocalFirst).toBe(false);
    expect(p.devArgs).toContain("--configure");
    expect(p.devArgs.join(" ")).toContain("--project app");
    expect(p.devArgs.join(" ")).toContain("--dev-deployment cloud");
  });

  it("fresh local: provisions with --dev-deployment local, no select-first", () => {
    const p = planConvexDev({ local: true }, true, "app");
    expect(p.selectLocalFirst).toBe(false);
    expect(p.devArgs.join(" ")).toContain("--dev-deployment local");
  });

  it("existing local: selects local first, then plain dev", () => {
    const p = planConvexDev({ local: true }, false, "app");
    expect(p.selectLocalFirst).toBe(true);
    expect(p.devArgs).toEqual(["convex", "dev", "--once", "--tail-logs", "disable"]);
  });

  it("provisioning with a team passes --team to skip the picker", () => {
    const p = planConvexDev({ local: false }, true, "app", "acme-team");
    expect(p.devArgs.join(" ")).toContain("--team acme-team");
  });

  it("no --team when none given, or when not provisioning", () => {
    expect(planConvexDev({ local: false }, true, "app").devArgs).not.toContain("--team");
    expect(planConvexDev({ local: false }, false, "app", "acme-team").devArgs).not.toContain(
      "--team",
    );
  });
});
