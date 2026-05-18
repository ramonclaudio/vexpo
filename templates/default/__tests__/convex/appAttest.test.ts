import { encode as cborEncode } from "cbor-x";
import { describe, expect, test } from "vitest";

import { verifyAssertionBytes, verifyAttestationBytes } from "@/convex/appAttest";

describe("verifyAttestationBytes", () => {
  test("rejects non-Apple fmt", () => {
    const bogus = cborEncode({ fmt: "fido-u2f", attStmt: {}, authData: Buffer.alloc(0) });
    expect(() =>
      verifyAttestationBytes({
        keyId: "ignored",
        attestation: bogus,
        challenge: "c",
        bundleId: "com.example",
        teamId: "AAAAA12345",
        environment: "development",
      }),
    ).toThrow(/unexpected fmt/);
  });

  test("rejects missing x5c", () => {
    const bogus = cborEncode({ fmt: "apple-appattest", attStmt: {}, authData: Buffer.alloc(0) });
    expect(() =>
      verifyAttestationBytes({
        keyId: "ignored",
        attestation: bogus,
        challenge: "c",
        bundleId: "com.example",
        teamId: "AAAAA12345",
        environment: "development",
      }),
    ).toThrow(/missing x5c or authData/);
  });

  test("rejects single-cert chain", () => {
    const bogus = cborEncode({
      fmt: "apple-appattest",
      attStmt: { x5c: [Buffer.alloc(8)] },
      authData: Buffer.alloc(64),
    });
    expect(() =>
      verifyAttestationBytes({
        keyId: "ignored",
        attestation: bogus,
        challenge: "c",
        bundleId: "com.example",
        teamId: "AAAAA12345",
        environment: "development",
      }),
    ).toThrow(/missing x5c or authData/);
  });
});

describe("verifyAssertionBytes", () => {
  test("rejects missing signature", () => {
    const bogus = cborEncode({ authenticatorData: Buffer.alloc(37) });
    expect(() =>
      verifyAssertionBytes({
        assertion: bogus,
        payload: "p",
        bundleId: "com.example",
        teamId: "AAAAA12345",
        publicKey: Buffer.alloc(0),
        storedCounter: 0,
      }),
    ).toThrow(/missing signature/);
  });

  test("rejects missing authenticatorData", () => {
    const bogus = cborEncode({ signature: Buffer.alloc(64) });
    expect(() =>
      verifyAssertionBytes({
        assertion: bogus,
        payload: "p",
        bundleId: "com.example",
        teamId: "AAAAA12345",
        publicKey: Buffer.alloc(0),
        storedCounter: 0,
      }),
    ).toThrow(/missing signature or authenticatorData/);
  });
});
