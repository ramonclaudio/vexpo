import { describe, expect, it } from "vitest";

import { redactValue } from "../../src/commands/doctor.ts";

describe("doctor --redact value masking", () => {
  it("masks convex deployment urls and slugs", () => {
    expect(redactValue("https://joyous-marmot-463.convex.site/resend-webhook")).toBe(
      "https://<deployment>.convex.site",
    );
    expect(redactValue("points at opulent-hyena-512")).toBe("points at <deployment>");
  });

  it("masks project uuids, key ids, and team ids", () => {
    expect(redactValue("35f2792e-b37d-49e2-b816-c3ad672d0c37")).toBe("<project-id>");
    expect(redactValue("6ZXL742R8C")).toBe("<id>");
    expect(redactValue("SWH9LXWCC3")).toBe("<id>");
  });

  it("masks emails, verified domains, bundle ids, and owner handles", () => {
    expect(redactValue("noreply@rmncldyo.com")).toBe("<email>");
    expect(redactValue("rmncldyo.com verified")).toBe("<domain> verified");
    expect(redactValue("com.rmncldyo.vexpo.signin")).toBe("<bundle-id>");
    expect(redactValue("@ramonclaudio/vexpo")).toBe("@<owner>/vexpo");
  });

  it("leaves statuses and plain copy alone", () => {
    expect(redactValue("required vars present")).toBe("required vars present");
    expect(redactValue("all 5 present (production)")).toBe("all 5 present (production)");
    expect(redactValue("140d remaining")).toBe("140d remaining");
    expect(redactValue("eas-cli health ok")).toBe("eas-cli health ok");
  });
});
