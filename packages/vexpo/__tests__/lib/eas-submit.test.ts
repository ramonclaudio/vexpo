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

  it("writes ascAppId into an inline ios block the regex can't reach (parse fallback)", () => {
    const inline =
      '{\n  "submit": {\n    "testflight": { "ios": { "metadataPath": "./m.json" } }\n  }\n}\n';
    const out = withAscAppId(inline, "1234567890");
    const ios = JSON.parse(out).submit.testflight.ios;
    expect(ios.ascAppId).toBe("1234567890");
    expect(ios.metadataPath).toBe("./m.json");
  });

  it("writes ascAppId into an empty ios block", () => {
    const empty = '{\n  "submit": {\n    "production": { "ios": {} }\n  }\n}\n';
    expect(JSON.parse(withAscAppId(empty, "999")).submit.production.ios.ascAppId).toBe("999");
  });

  it("covers every profile when shapes are mixed (pretty + inline)", () => {
    const mixed =
      '{\n  "submit": {\n    "testflight": {\n      "ios": {\n        "metadataPath": "./m.json"\n      }\n    },\n    "production": { "ios": { "metadataPath": "./m.json" } }\n  }\n}\n';
    expect(submitProfilesMissingAscAppId(withAscAppId(mixed, "1234567890"))).toEqual([]);
  });

  it("never touches a build ios block, even when submit comes before build", () => {
    const submitFirst =
      '{\n  "submit": {\n    "production": {\n      "ios": {\n        "metadataPath": "./m.json"\n      }\n    }\n  },\n  "build": {\n    "production": {\n      "ios": {\n        "credentialsSource": "remote"\n      }\n    }\n  }\n}\n';
    const cfg = JSON.parse(withAscAppId(submitFirst, "1234567890"));
    expect(cfg.submit.production.ios.ascAppId).toBe("1234567890");
    expect(cfg.build.production.ios).not.toHaveProperty("ascAppId");
  });

  it("scopes value updates to submit, not a later build section", () => {
    const withId =
      '{\n  "submit": { "production": { "ios": { "ascAppId": "old", "metadataPath": "./m.json" } } },\n  "build": { "production": { "ios": { "credentialsSource": "remote" } } }\n}\n';
    const cfg = JSON.parse(withAscAppId(withId, "new"));
    expect(cfg.submit.production.ios.ascAppId).toBe("new");
    expect(cfg.build.production.ios).not.toHaveProperty("ascAppId");
  });

  it("does not throw on a non-object ios value", () => {
    const weird = '{\n  "submit": { "p": { "ios": "weird" } }\n}\n';
    expect(() => withAscAppId(weird, "1234567890")).not.toThrow();
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
