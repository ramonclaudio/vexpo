import { describe, expect, it } from "vitest";

import {
  deploymentsOfType,
  describeDeployment,
  type PlatformDeployment,
} from "../../src/lib/convex-management.ts";

const dep = (over: Partial<PlatformDeployment>): PlatformDeployment => ({
  name: "x",
  deploymentType: "dev",
  projectId: 1,
  ...over,
});

describe("deploymentsOfType", () => {
  it("filters by deployment type", () => {
    const list = [
      dep({ name: "a", deploymentType: "dev" }),
      dep({ name: "b", deploymentType: "dev" }),
      dep({ name: "c", deploymentType: "prod" }),
      dep({ name: "d", deploymentType: "preview" }),
    ];
    expect(deploymentsOfType(list, "dev").map((d) => d.name)).toEqual(["a", "b"]);
    expect(deploymentsOfType(list, "prod").map((d) => d.name)).toEqual(["c"]);
    expect(deploymentsOfType(list, "custom")).toEqual([]);
  });
});

describe("describeDeployment", () => {
  it("includes the reference when present", () => {
    expect(describeDeployment(dep({ name: "happy-otter-100", reference: "dev/auto" }))).toBe(
      "happy-otter-100 (dev/auto)",
    );
  });
  it("falls back to just the name", () => {
    expect(describeDeployment(dep({ name: "swift-lynx-200", reference: undefined }))).toBe(
      "swift-lynx-200",
    );
  });
});
