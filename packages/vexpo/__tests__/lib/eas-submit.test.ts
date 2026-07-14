import { describe, expect, it } from "vitest";

import {
  submitProfilesMissingAscAppId,
  withAscApiKey,
  withAscAppId,
} from "../../src/lib/eas-submit.ts";

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

const parse = (s: string) => JSON.parse(s);

describe("withAscAppId", () => {
  it("sets ascAppId on every submit profile's ios block", () => {
    const cfg = parse(withAscAppId(EAS, "1234567890"));
    expect(cfg.submit.testflight.ios.ascAppId).toBe("1234567890");
    expect(cfg.submit.production.ios.ascAppId).toBe("1234567890");
    expect(cfg.submit.testflight.ios.metadataPath).toBe("./store.config.json");
  });

  it("does not touch build-profile ios blocks", () => {
    const cfg = parse(withAscAppId(EAS, "1234567890"));
    expect(cfg.build.production.ios).not.toHaveProperty("ascAppId");
    expect(cfg.build.production.cache.paths).toEqual(["node_modules", "ios/Pods"]);
  });

  it("is idempotent for the same id", () => {
    const once = withAscAppId(EAS, "1234567890");
    expect(withAscAppId(once, "1234567890")).toBe(once);
  });

  it("updates an existing different id without duplicating the key", () => {
    const updated = withAscAppId(withAscAppId(EAS, "111"), "222");
    const cfg = parse(updated);
    expect(cfg.submit.testflight.ios.ascAppId).toBe("222");
    expect(cfg.submit.production.ios.ascAppId).toBe("222");
    expect(updated.match(/"ascAppId"/g)).toHaveLength(2);
  });

  it("writes into an inline ios block", () => {
    const inline =
      '{\n  "submit": {\n    "testflight": { "ios": { "metadataPath": "./m.json" } }\n  }\n}\n';
    const ios = parse(withAscAppId(inline, "1234567890")).submit.testflight.ios;
    expect(ios.ascAppId).toBe("1234567890");
    expect(ios.metadataPath).toBe("./m.json");
  });

  it("writes into an empty ios block", () => {
    const empty = '{\n  "submit": {\n    "production": { "ios": {} }\n  }\n}\n';
    expect(parse(withAscAppId(empty, "999")).submit.production.ios.ascAppId).toBe("999");
  });

  it("never touches a build ios block, even when submit comes before build", () => {
    const submitFirst =
      '{\n  "submit": { "production": { "ios": { "metadataPath": "./m.json" } } },\n  "build": { "production": { "ios": { "credentialsSource": "remote" } } }\n}\n';
    const cfg = parse(withAscAppId(submitFirst, "1234567890"));
    expect(cfg.submit.production.ios.ascAppId).toBe("1234567890");
    expect(cfg.build.production.ios).not.toHaveProperty("ascAppId");
  });

  it("leaves a nested ascAppId inside ios untouched", () => {
    const nested =
      '{\n  "submit": { "production": { "ios": { "metadata": { "ascAppId": "nested" } } } }\n}\n';
    const ios = parse(withAscAppId(nested, "1234567890")).submit.production.ios;
    expect(ios.ascAppId).toBe("1234567890");
    expect(ios.metadata.ascAppId).toBe("nested");
  });

  it("leaves a sibling android.ascAppId untouched", () => {
    const sibling =
      '{\n  "submit": { "production": { "ios": { "metadataPath": "./m.json" }, "android": { "ascAppId": "android-stray" } } }\n}\n';
    const p = parse(withAscAppId(sibling, "1234567890")).submit.production;
    expect(p.ios.ascAppId).toBe("1234567890");
    expect(p.android.ascAppId).toBe("android-stray");
  });

  it("returns a non-object ios value unchanged (identity no-op)", () => {
    const weird = '{\n  "submit": { "p": { "ios": "weird" } }\n}\n';
    // needsAscAppId sees ios is not an object, so withAscAppId must return the
    // input untouched. `.toBe` pins that no-op; `.not.toThrow` would still pass
    // if the early-return guard were deleted and the value got reformatted.
    expect(withAscAppId(weird, "1234567890")).toBe(weird);
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

describe("withAscApiKey", () => {
  const KEY = {
    path: "./credentials/asc-key.p8",
    keyId: "ABCDE12345",
    issuerId: "11111111-2222-3333-4444-555555555555",
  };

  it("sets all three key fields on every submit profile's ios block", () => {
    const cfg = parse(withAscApiKey(EAS, KEY));
    for (const p of ["testflight", "production"]) {
      expect(cfg.submit[p].ios.ascApiKeyPath).toBe(KEY.path);
      expect(cfg.submit[p].ios.ascApiKeyId).toBe(KEY.keyId);
      expect(cfg.submit[p].ios.ascApiKeyIssuerId).toBe(KEY.issuerId);
    }
  });

  it("leaves build profiles and sibling keys alone", () => {
    const cfg = parse(withAscApiKey(EAS, KEY));
    expect(cfg.build.production.ios).toEqual({ credentialsSource: "remote" });
    expect(cfg.submit.testflight.ios.metadataPath).toBe("./store.config.json");
  });

  it("is idempotent, keyed on all three fields", () => {
    const once = withAscApiKey(EAS, KEY);
    expect(withAscApiKey(once, KEY)).toBe(once);
    // A profile carrying only one of the three still gets the full set.
    const partial = once.replace(`"ascApiKeyId": "${KEY.keyId}",\n`, "");
    const healed = parse(withAscApiKey(partial, KEY));
    expect(healed.submit.production.ios.ascApiKeyId).toBe(KEY.keyId);
  });

  it("composes with withAscAppId", () => {
    const cfg = parse(withAscApiKey(withAscAppId(EAS, "1234567890"), KEY));
    expect(cfg.submit.testflight.ios.ascAppId).toBe("1234567890");
    expect(cfg.submit.testflight.ios.ascApiKeyPath).toBe(KEY.path);
  });
});
