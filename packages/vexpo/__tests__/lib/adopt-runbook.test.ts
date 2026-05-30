import { describe, expect, it } from "vitest";

import { buildFinishRunbook } from "../../src/commands/adopt.ts";

const cmds = (s: Parameters<typeof buildFinishRunbook>[0]) =>
  buildFinishRunbook(s).map((x) => x.cmd);

const FULLY_PROVISIONED = {
  devSlug: "happy-otter-100",
  hasResend: true,
  hasApple: true,
  hasProd: true,
  hasEasProdUrl: true,
};

describe("buildFinishRunbook", () => {
  it("emits only the prod-mirror, key sync, and verify when everything dev-side is set", () => {
    expect(cmds(FULLY_PROVISIONED)).toEqual([
      "vexpo convex:migrate --from happy-otter-100 --prod",
      "vexpo env convex-key",
      "vexpo doctor --channel prod",
    ]);
  });

  it("lists every leg for a fresh EAS-integration-created project", () => {
    expect(
      cmds({
        devSlug: "abc-1",
        hasResend: false,
        hasApple: false,
        hasProd: false,
        hasEasProdUrl: false,
      }),
    ).toEqual([
      "vexpo resend",
      "vexpo apple jwt",
      "vexpo asc:connect",
      "npx convex deploy",
      "vexpo convex:migrate --from abc-1 --prod",
      "vexpo env convex-key",
      "vexpo full",
      "vexpo doctor --channel prod",
    ]);
  });

  it("includes the convex deploy step only when no prod deployment exists", () => {
    expect(cmds({ ...FULLY_PROVISIONED, hasProd: false })).toContain("npx convex deploy");
    expect(cmds(FULLY_PROVISIONED)).not.toContain("npx convex deploy");
  });

  it("always threads the resolved dev slug into the migrate command", () => {
    expect(cmds({ ...FULLY_PROVISIONED, devSlug: "wandering-yak-9" })).toContain(
      "vexpo convex:migrate --from wandering-yak-9 --prod",
    );
  });
});
