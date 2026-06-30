import { describe, expect, it } from "vitest";

import { buildDoctorReport, redactValue } from "../../src/commands/doctor.ts";
import type { Check } from "../../src/lib/verify.ts";

describe("doctor --redact value masking", () => {
  it("masks convex deployment urls and slugs", () => {
    expect(redactValue("https://joyous-marmot-463.convex.site/resend-webhook")).toBe(
      "https://<deployment>.convex.site",
    );
    expect(redactValue("points at opulent-hyena-512")).toBe("points at <deployment>");
  });

  it("masks project uuids, key ids, and team ids", () => {
    expect(redactValue("12345678-1234-4abc-8def-1234567890ab")).toBe("<project-id>");
    expect(redactValue("ABCDE12345")).toBe("<id>");
    expect(redactValue("FGHIJ67890")).toBe("<id>");
  });

  it("masks emails, verified domains, bundle ids, and owner handles", () => {
    expect(redactValue("noreply@example.com")).toBe("<email>");
    expect(redactValue("example.com verified")).toBe("<domain> verified");
    expect(redactValue("com.example.app.signin")).toBe("<bundle-id>");
    expect(redactValue("@ramonclaudio/vexpo")).toBe("@<owner>/vexpo");
  });

  it("leaves statuses and plain copy alone", () => {
    expect(redactValue("required vars present")).toBe("required vars present");
    expect(redactValue("all 5 present (production)")).toBe("all 5 present (production)");
    expect(redactValue("140d remaining")).toBe("140d remaining");
    expect(redactValue("eas-cli health ok")).toBe("eas-cli health ok");
  });
});

describe("buildDoctorReport --redact for --json", () => {
  const checks: Check[] = [
    { category: "resend", name: "email-from", severity: "ok", message: "noreply@example.com" },
    {
      category: "coherence",
      name: "bundle-id-match",
      severity: "ok",
      message: "com.example.app.signin",
      details: "points at opulent-hyena-512",
    },
  ];
  const summary = { ok: 2, warn: 0, fail: 0, skip: 0 };

  it("masks identifiers in the serialized json when redact is set", () => {
    const json = JSON.stringify(buildDoctorReport("dev", summary, checks, true));
    expect(json).not.toContain("noreply@example.com");
    expect(json).not.toContain("com.example.app.signin");
    expect(json).not.toContain("opulent-hyena-512");
    expect(json).toContain("<email>");
    expect(json).toContain("<bundle-id>");
    expect(json).toContain("<deployment>");
  });

  it("leaves values raw when redact is off", () => {
    const json = JSON.stringify(buildDoctorReport("dev", summary, checks, false));
    expect(json).toContain("noreply@example.com");
    expect(json).toContain("com.example.app.signin");
  });
});
