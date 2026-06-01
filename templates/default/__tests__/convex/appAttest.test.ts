import { createHash, generateKeyPairSync, sign as nodeSign, type KeyObject } from "node:crypto";

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

// The real verification core (ECDSA signature, counter monotonicity, rpIdHash)
// was previously unreached: every test above only hit the CBOR early-guards. A
// genuine signed round-trip exercises it, so a regression that inverts the
// counter check or short-circuits the signature verify can't slip through.
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();

function makeAuthData(teamId: string, bundleId: string, counter: number): Buffer {
  const rpIdHash = sha256(Buffer.from(`${teamId}.${bundleId}`, "utf8"));
  const flags = Buffer.from([0x00]);
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter);
  return Buffer.concat([rpIdHash, flags, counterBuf]); // 37 bytes, no credential block
}

// Mirror the device: sign over sha256(authData || sha256(payload)) with the
// digest passed directly (algorithm null), matching the server's verify(null, …).
function signAssertion(privateKey: KeyObject, authData: Buffer, payload: string): Buffer {
  const hashedData = sha256(Buffer.concat([authData, sha256(Buffer.from(payload, "utf8"))]));
  const signature = nodeSign(null, hashedData, privateKey);
  return cborEncode({ signature, authenticatorData: authData });
}

describe("verifyAssertionBytes (signature + counter + rpIdHash)", () => {
  const TEAM_ID = "AAAAA12345";
  const BUNDLE_ID = "com.example.app";
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;

  test("accepts a valid assertion and returns the new counter", () => {
    const authData = makeAuthData(TEAM_ID, BUNDLE_ID, 5);
    const assertion = signAssertion(privateKey, authData, "request-payload");
    const counter = verifyAssertionBytes({
      assertion,
      payload: "request-payload",
      bundleId: BUNDLE_ID,
      teamId: TEAM_ID,
      publicKey: publicKeyDer,
      storedCounter: 0,
    });
    expect(counter).toBe(5);
  });

  test("rejects when the payload differs from what was signed", () => {
    const authData = makeAuthData(TEAM_ID, BUNDLE_ID, 5);
    const assertion = signAssertion(privateKey, authData, "original-payload");
    expect(() =>
      verifyAssertionBytes({
        assertion,
        payload: "tampered-payload",
        bundleId: BUNDLE_ID,
        teamId: TEAM_ID,
        publicKey: publicKeyDer,
        storedCounter: 0,
      }),
    ).toThrow(/signature failed verification/);
  });

  test("rejects a replayed counter (not strictly greater than stored)", () => {
    const authData = makeAuthData(TEAM_ID, BUNDLE_ID, 3);
    const assertion = signAssertion(privateKey, authData, "p");
    expect(() =>
      verifyAssertionBytes({
        assertion,
        payload: "p",
        bundleId: BUNDLE_ID,
        teamId: TEAM_ID,
        publicKey: publicKeyDer,
        storedCounter: 5,
      }),
    ).toThrow(/not strictly greater/);
  });

  test("rejects an rpIdHash that doesn't match TEAM_ID.BUNDLE_ID", () => {
    const authData = makeAuthData("WRONG00000", "com.wrong.app", 5);
    const assertion = signAssertion(privateKey, authData, "p");
    expect(() =>
      verifyAssertionBytes({
        assertion,
        payload: "p",
        bundleId: BUNDLE_ID,
        teamId: TEAM_ID,
        publicKey: publicKeyDer,
        storedCounter: 0,
      }),
    ).toThrow(/rpIdHash mismatch/);
  });
});
