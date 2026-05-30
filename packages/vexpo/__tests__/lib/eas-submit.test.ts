import { describe, expect, it } from "vitest";

import { submitProfilesMissingAscAppId, withAscAppId } from "../../src/lib/eas-submit.ts";

const EAS = `{
  "build": {
    "production": {
      "autoIncrement": true,
      "cache": {
        "paths": ["node_modules", "ios/Pods"]
      },
      "ios": {
        "credentialsSource": "remote"
      }
    }
  },
  "submit": {
    "testflight": {
      "ios": {
        "metadataPath": "./store.config.json"
      }
    },
    "production": {
      "ios": {
        "metadataPath": "./store.config.json"
      }
    }
  }
}
`;

describe("withAscAppId", () => {
  it("inserts ascAppId into every submit profile, before the first key", () => {
    const out = withAscAppId(EAS, "1234567890");
    const cfg = JSON.parse(out);
    expect(cfg.submit.testflight.ios.ascAppId).toBe("1234567890");
    expect(cfg.submit.production.ios.ascAppId).toBe("1234567890");
    expect(out).toContain('"ascAppId": "1234567890",\n        "metadataPath"');
  });

  it("does not touch build-profile ios blocks (scoped to submit)", () => {
    const cfg = JSON.parse(withAscAppId(EAS, "1234567890"));
    expect(cfg.build.production.ios).not.toHaveProperty("ascAppId");
  });

  it("preserves formatting, no reflow of compact arrays", () => {
    expect(withAscAppId(EAS, "1234567890")).toContain('["node_modules", "ios/Pods"]');
  });

  it("is idempotent for the same id", () => {
    const once = withAscAppId(EAS, "1234567890");
    expect(withAscAppId(once, "1234567890")).toBe(once);
  });

  it("updates an existing different id without duplicating the key", () => {
    const once = withAscAppId(EAS, "111");
    const updated = withAscAppId(once, "222");
    const cfg = JSON.parse(updated);
    expect(cfg.submit.testflight.ios.ascAppId).toBe("222");
    expect(cfg.submit.production.ios.ascAppId).toBe("222");
    expect(updated.match(/"ascAppId"/g)).toHaveLength(2);
  });

  it("no-ops when there is no submit section", () => {
    const noSubmit = '{\n  "build": {}\n}\n';
    expect(withAscAppId(noSubmit, "1234567890")).toBe(noSubmit);
  });
});

describe("submitProfilesMissingAscAppId", () => {
  it("lists profiles whose ios block lacks ascAppId", () => {
    expect(submitProfilesMissingAscAppId(EAS)).toEqual(["testflight", "production"]);
  });

  it("returns [] once all profiles carry it", () => {
    expect(submitProfilesMissingAscAppId(withAscAppId(EAS, "1234567890"))).toEqual([]);
  });

  it("returns [] on unparseable input", () => {
    expect(submitProfilesMissingAscAppId("{not json")).toEqual([]);
  });
});
