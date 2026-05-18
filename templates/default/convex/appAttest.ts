"use node";

import { X509Certificate, createHash, createPublicKey, randomBytes, verify } from "node:crypto";

import { decode as cborDecode } from "cbor-x";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Apple App Attest verifier.
 *
 * Implements every step of Apple's attestation + assertion protocol so a
 * Convex action can prove that incoming requests came from a real, unmodified
 * vexpo binary running on a real iOS device with a Secure Enclave.
 *
 * Protocol (per Apple's "Validating Apps That Connect to Your Server"):
 *
 *   ATTESTATION (one-time per device)
 *     1. Server issues a 32-byte random `challenge`.
 *     2. Client calls `generateKeyAsync()` → keyId.
 *     3. Client calls `attestKeyAsync(keyId, sha256(challenge))` → CBOR
 *        attestation containing `{ fmt: 'apple-appattest', attStmt: { x5c,
 *        receipt }, authData }`.
 *     4. Server (this module) verifies:
 *        a. cert chain `x5c[0]` → `x5c[1]` → Apple App Attest Root CA
 *        b. compute nonce = sha256(authData || sha256(challenge)); verify
 *           it matches the leaf cert's `1.2.840.113635.100.8.2` extension
 *        c. hash the leaf cert's public key; verify it matches the
 *           `credentialId` portion of authData
 *        d. authData.rpIdHash == sha256("<TEAM_ID>.<BUNDLE_ID>")
 *        e. authData.aaguid matches the expected production or dev value
 *        f. authData.counter == 0
 *     5. Server stores `{ keyId, publicKey, counter: 0, environment }`.
 *
 *   ASSERTION (per signed request)
 *     1. Client calls `generateAssertionAsync(keyId, sha256(payload))` →
 *        CBOR assertion containing `{ signature, authenticatorData }`.
 *     2. Server (this module) verifies:
 *        a. `signature` is a valid ECDSA-P256-SHA256 signature over
 *           sha256(authenticatorData || sha256(payload)) using the stored
 *           public key
 *        b. authenticatorData.rpIdHash matches the expected value
 *        c. authenticatorData.counter > stored counter
 *     3. Server bumps the stored counter.
 *
 * https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
 */

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

// Apple App Attest Root CA, distributed by Apple at
// https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
// Pinned in source so a compromised CDN can't replace it.
const APPLE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

const APPLE_ROOT_X509 = new X509Certificate(APPLE_ROOT_CA);

const APPLE_NONCE_OID = "1.2.840.113635.100.8.2";

// AAGUID is 16 bytes. Production runs ship "appattest" + 7 NULs. Development
// (simulator-style attestation, only valid when Xcode debugger is attached
// to the app) ships "appattestdevelop". A production app should never see
// the dev AAGUID; we reject it unless the deployment is explicitly running
// in development mode.
const AAGUID_PRODUCTION = Buffer.from("appattest\0\0\0\0\0\0\0", "binary");
const AAGUID_DEVELOPMENT = Buffer.from("appattestdevelop", "binary");

// Challenges TTL'd so a captured nonce can't be replayed indefinitely.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// ----------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------

/**
 * Issue a fresh App Attest challenge. The client passes the returned
 * `nonce` to `attestKeyAsync` or `generateAssertionAsync` and posts the
 * resulting attestation back via `verifyAttestation` / `verifyAssertion`.
 *
 * Single-use: each nonce is consumed on the first verification that
 * references it. Expired nonces are swept by `cleanupAppAttestChallenges`.
 */
export const issueChallenge = internalAction({
  args: {},
  returns: v.object({ nonce: v.string(), expiresAt: v.number() }),
  handler: async (ctx) => {
    const nonce = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    await ctx.runMutation(internal.appAttestStore.createChallenge, { nonce, expiresAt });
    return { nonce, expiresAt };
  },
});

/**
 * Verify a fresh App Attest attestation, store the credential public key,
 * and consume the challenge.
 *
 * Throws on any verification failure. On success returns
 * `{ keyId, publicKey, environment }` for the caller to record on the
 * authenticated user. Storage is handled here; callers don't write to
 * `appAttestKeys` directly.
 *
 * `bundleId` and `teamId` are the App Identifier components used to
 * compute `rpIdHash`. They default to env vars set by `vexpo apple`.
 */
export const verifyAttestation = internalAction({
  args: {
    keyId: v.string(),
    attestation: v.string(),
    challenge: v.string(),
    bundleId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    keyId: v.string(),
    publicKey: v.string(),
    environment: v.union(v.literal("development"), v.literal("production")),
  }),
  handler: async (ctx, args) => {
    const consumed = await ctx.runMutation(internal.appAttestStore.consumeChallenge, {
      nonce: args.challenge,
      now: Date.now(),
    });
    if (!consumed) {
      throw new Error("app-attest: challenge unknown, expired, or already consumed");
    }

    const bundleId = args.bundleId ?? process.env.APP_BUNDLE_ID;
    const teamId = args.teamId ?? process.env.APPLE_TEAM_ID;
    if (!bundleId || !teamId) {
      throw new Error("app-attest: APP_BUNDLE_ID and APPLE_TEAM_ID must be set");
    }

    const environment = decideEnvironment();
    const result = verifyAttestationBytes({
      keyId: args.keyId,
      attestation: Buffer.from(args.attestation, "base64"),
      challenge: args.challenge,
      bundleId,
      teamId,
      environment,
    });

    await ctx.runMutation(internal.appAttestStore.storeKey, {
      keyId: args.keyId,
      publicKey: result.publicKey,
      environment: result.environment,
      userId: args.userId,
      now: Date.now(),
    });

    return { keyId: args.keyId, publicKey: result.publicKey, environment: result.environment };
  },
});

/**
 * Verify an App Attest assertion against a previously-attested key and
 * the payload the client signed. Bumps the stored counter on success.
 */
export const verifyAssertion = internalAction({
  args: {
    keyId: v.string(),
    assertion: v.string(),
    payload: v.string(),
    bundleId: v.optional(v.string()),
    teamId: v.optional(v.string()),
  },
  returns: v.object({ counter: v.number() }),
  handler: async (ctx, args) => {
    const key = await ctx.runQuery(internal.appAttestStore.findKey, { keyId: args.keyId });
    if (!key) throw new Error("app-attest: unknown keyId");

    const bundleId = args.bundleId ?? process.env.APP_BUNDLE_ID;
    const teamId = args.teamId ?? process.env.APPLE_TEAM_ID;
    if (!bundleId || !teamId) {
      throw new Error("app-attest: APP_BUNDLE_ID and APPLE_TEAM_ID must be set");
    }

    const newCounter = verifyAssertionBytes({
      assertion: Buffer.from(args.assertion, "base64"),
      payload: args.payload,
      bundleId,
      teamId,
      publicKey: Buffer.from(key.publicKey, "base64url"),
      storedCounter: key.counter,
    });

    await ctx.runMutation(internal.appAttestStore.bumpCounter, {
      keyId: args.keyId,
      counter: newCounter,
    });

    return { counter: newCounter };
  },
});

// ----------------------------------------------------------------------------
// Verifier (pure)
// ----------------------------------------------------------------------------

type AttestationInputs = {
  keyId: string;
  attestation: Buffer;
  challenge: string;
  bundleId: string;
  teamId: string;
  environment: "development" | "production";
};

type AttestationResult = {
  publicKey: string;
  environment: "development" | "production";
};

export function verifyAttestationBytes(inputs: AttestationInputs): AttestationResult {
  const decoded = cborDecode(inputs.attestation) as {
    fmt?: string;
    attStmt?: { x5c?: Buffer[]; receipt?: Buffer };
    authData?: Buffer;
  };

  if (decoded.fmt !== "apple-appattest") {
    throw new Error(`app-attest: unexpected fmt '${decoded.fmt}'`);
  }
  const x5c = decoded.attStmt?.x5c;
  const authData = decoded.authData;
  if (!x5c || x5c.length < 2 || !authData) {
    throw new Error("app-attest: missing x5c or authData");
  }

  // Step 1: cert chain. credCert is x5c[0], intermediate is x5c[1] (and
  // possibly more), root is Apple's root CA pinned above.
  const credCert = new X509Certificate(x5c[0]);
  const intermediate = new X509Certificate(x5c[1]);
  if (!intermediate.verify(APPLE_ROOT_X509.publicKey)) {
    throw new Error("app-attest: intermediate cert is not signed by Apple App Attest Root CA");
  }
  if (!credCert.verify(intermediate.publicKey)) {
    throw new Error("app-attest: credential cert is not signed by the intermediate");
  }
  assertCertValidity(credCert);

  // Step 2-3: compute the expected nonce.
  const clientDataHash = sha256(Buffer.from(inputs.challenge, "utf8"));
  const expectedNonce = sha256(Buffer.concat([authData, clientDataHash]));

  // Step 4: read the leaf cert's nonce extension (1.2.840.113635.100.8.2)
  // and check it matches the expected nonce.
  const credExtNonce = extractAppleNonceExtension(credCert);
  if (!credExtNonce || !timingSafeEqual(credExtNonce, expectedNonce)) {
    throw new Error("app-attest: nonce mismatch");
  }

  // Step 5: the credential public key hash (SHA-256 of the DER
  // SubjectPublicKeyInfo) should equal the credentialId portion of
  // authData. We extract the key from the leaf cert, hash it, and
  // compare to the keyId the client sent.
  const credPubKeyDer = credCert.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const credPubKeyHash = sha256(credPubKeyDer);
  if (credPubKeyHash.toString("base64") !== inputs.keyId) {
    throw new Error("app-attest: leaf cert public-key hash does not match keyId");
  }

  // Step 6-9: rpIdHash, AAGUID, counter, credId checks within authData.
  const ad = parseAuthData(authData);

  const expectedRpIdHash = sha256(Buffer.from(`${inputs.teamId}.${inputs.bundleId}`, "utf8"));
  if (!timingSafeEqual(ad.rpIdHash, expectedRpIdHash)) {
    throw new Error("app-attest: rpIdHash does not match TEAM_ID.BUNDLE_ID");
  }

  if (ad.counter !== 0) {
    throw new Error("app-attest: attestation counter must be 0");
  }

  const aaguidOk =
    inputs.environment === "production"
      ? timingSafeEqual(ad.aaguid, AAGUID_PRODUCTION)
      : timingSafeEqual(ad.aaguid, AAGUID_DEVELOPMENT) ||
        timingSafeEqual(ad.aaguid, AAGUID_PRODUCTION);
  if (!aaguidOk) {
    throw new Error(
      `app-attest: AAGUID does not match expected for environment '${inputs.environment}'`,
    );
  }

  if (!ad.credId || ad.credId.toString("base64") !== inputs.keyId) {
    throw new Error("app-attest: credentialId in authData does not match keyId");
  }

  return {
    publicKey: credPubKeyDer.toString("base64url"),
    environment: inputs.environment,
  };
}

type AssertionInputs = {
  assertion: Buffer;
  payload: string;
  bundleId: string;
  teamId: string;
  publicKey: Buffer; // SPKI DER
  storedCounter: number;
};

export function verifyAssertionBytes(inputs: AssertionInputs): number {
  const decoded = cborDecode(inputs.assertion) as {
    signature?: Buffer;
    authenticatorData?: Buffer;
  };
  const signature = decoded.signature;
  const authData = decoded.authenticatorData;
  if (!signature || !authData) {
    throw new Error("app-attest: assertion missing signature or authenticatorData");
  }

  // Reconstruct what the device signed: SHA256(authData || SHA256(payload))
  const clientDataHash = sha256(Buffer.from(inputs.payload, "utf8"));
  const dataToSign = Buffer.concat([authData, clientDataHash]);
  const hashedData = sha256(dataToSign);

  // The public key in storage is DER SPKI; convert to a KeyObject for
  // crypto.verify.
  const pubKey = createPublicKey({ key: inputs.publicKey, format: "der", type: "spki" });

  // Apple emits ECDSA in IEEE-P1363 r||s form, but Node's `verify` defaults
  // to DER. Apple's actual output is DER though, per their docs ("This is a
  // DER-encoded ASN.1 sequence"). Both formats are possible across iOS
  // versions, so try DER first and fall back to IEEE-P1363.
  const ok =
    verify(null, hashedData, pubKey, signature) ||
    verify(null, hashedData, { key: pubKey, dsaEncoding: "ieee-p1363" }, signature);
  if (!ok) {
    throw new Error("app-attest: assertion signature failed verification");
  }

  // rpIdHash and counter checks reuse the attestation parser; the layout
  // is identical except attestedCredentialData isn't present.
  const ad = parseAuthData(authData, { hasCredential: false });

  const expectedRpIdHash = sha256(Buffer.from(`${inputs.teamId}.${inputs.bundleId}`, "utf8"));
  if (!timingSafeEqual(ad.rpIdHash, expectedRpIdHash)) {
    throw new Error("app-attest: assertion rpIdHash mismatch");
  }
  if (ad.counter <= inputs.storedCounter) {
    throw new Error(
      `app-attest: assertion counter ${ad.counter} not strictly greater than stored ${inputs.storedCounter}`,
    );
  }
  return ad.counter;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function sha256(input: Buffer): Buffer {
  return createHash("sha256").update(input).digest();
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function assertCertValidity(cert: X509Certificate): void {
  const now = Date.now();
  const notBefore = Date.parse(cert.validFrom);
  const notAfter = Date.parse(cert.validTo);
  if (Number.isFinite(notBefore) && now < notBefore) {
    throw new Error("app-attest: credential cert not yet valid");
  }
  if (Number.isFinite(notAfter) && now > notAfter) {
    throw new Error("app-attest: credential cert expired");
  }
}

/**
 * Read the Apple App Attest nonce extension. The extension value is a
 * DER-encoded ASN.1 sequence:
 *   SEQUENCE { [1] OCTET STRING { <nonce bytes> } }
 *
 * Node's `X509Certificate` exposes the raw extension DER through `raw`,
 * but not individual extensions. We pull the cert's DER bytes and walk
 * to the extension by OID.
 */
function extractAppleNonceExtension(cert: X509Certificate): Buffer | null {
  const der = cert.raw;
  const oidBytes = encodeOid(APPLE_NONCE_OID);
  const start = der.indexOf(oidBytes);
  if (start < 0) return null;
  // After the OID, the extension is `[critical BOOLEAN] OCTET STRING { ... }`.
  // We skip the OID, any optional BOOLEAN, and parse the OCTET STRING wrapper.
  let i = start + oidBytes.length;
  // Optional critical BOOLEAN.
  if (der[i] === 0x01 && der[i + 1] === 0x01) i += 3;
  // OCTET STRING wrapper holding the actual extension DER.
  if (der[i] !== 0x04) return null;
  const outerLen = readDerLength(der, i + 1);
  if (!outerLen) return null;
  let cursor = i + 1 + outerLen.headerBytes;
  // Inner SEQUENCE.
  if (der[cursor] !== 0x30) return null;
  const innerLen = readDerLength(der, cursor + 1);
  if (!innerLen) return null;
  cursor += 1 + innerLen.headerBytes;
  // Context-specific [1] tag = 0xa1, holding the OCTET STRING with the nonce.
  if (der[cursor] !== 0xa1) return null;
  const ctxLen = readDerLength(der, cursor + 1);
  if (!ctxLen) return null;
  cursor += 1 + ctxLen.headerBytes;
  if (der[cursor] !== 0x04) return null;
  const nonceLen = readDerLength(der, cursor + 1);
  if (!nonceLen) return null;
  cursor += 1 + nonceLen.headerBytes;
  return Buffer.from(der.subarray(cursor, cursor + nonceLen.value));
}

function readDerLength(buf: Buffer, offset: number): { value: number; headerBytes: number } | null {
  const first = buf[offset];
  if (first === undefined) return null;
  if (first < 0x80) return { value: first, headerBytes: 1 };
  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 4) return null;
  let value = 0;
  for (let i = 0; i < lengthBytes; i++) value = (value << 8) | buf[offset + 1 + i]!;
  return { value, headerBytes: 1 + lengthBytes };
}

function encodeOid(oid: string): Buffer {
  // Minimal OID encoder: produces the DER value bytes (without the type
  // tag). Used to locate the OID inside the cert's raw DER.
  const parts = oid.split(".").map((p) => parseInt(p, 10));
  if (parts.length < 2) throw new Error(`invalid OID: ${oid}`);
  const bytes: number[] = [40 * parts[0]! + parts[1]!];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i]!;
    const buf: number[] = [];
    do {
      buf.unshift(v & 0x7f);
      v >>= 7;
    } while (v > 0);
    for (let j = 0; j < buf.length - 1; j++) buf[j]! |= 0x80;
    bytes.push(...buf);
  }
  return Buffer.from([0x06, bytes.length, ...bytes]);
}

type ParsedAuthData = {
  rpIdHash: Buffer;
  flags: number;
  counter: number;
  aaguid: Buffer;
  credId: Buffer | null;
  credentialPublicKey: Buffer | null;
};

function parseAuthData(buf: Buffer, opts: { hasCredential?: boolean } = {}): ParsedAuthData {
  const hasCredential = opts.hasCredential ?? true;
  if (buf.length < 37) throw new Error("app-attest: authData too short");
  const rpIdHash = Buffer.from(buf.subarray(0, 32));
  const flags = buf[32]!;
  const counter = buf.readUInt32BE(33);
  let aaguid = Buffer.alloc(16);
  let credId: Buffer | null = null;
  let credentialPublicKey: Buffer | null = null;
  if (hasCredential) {
    if (buf.length < 55) throw new Error("app-attest: authData missing credential block");
    aaguid = Buffer.from(buf.subarray(37, 53));
    const credIdLen = buf.readUInt16BE(53);
    if (buf.length < 55 + credIdLen) throw new Error("app-attest: authData credentialId overruns");
    credId = Buffer.from(buf.subarray(55, 55 + credIdLen));
    credentialPublicKey = Buffer.from(buf.subarray(55 + credIdLen));
  }
  return { rpIdHash, flags, counter, aaguid, credId, credentialPublicKey };
}

function decideEnvironment(): "development" | "production" {
  const flag = process.env.APP_ATTEST_ENVIRONMENT;
  if (flag === "production" || flag === "development") return flag;
  return process.env.CONVEX_DEPLOYMENT_TYPE === "prod" ? "production" : "development";
}
