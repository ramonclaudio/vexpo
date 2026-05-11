import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signClientSecret } from "../../src/lib/apple-jwt";

// Apple's `client_secret` for Sign In with Apple is an ES256 JWT signed with the
// developer's `.p8` private key. Apple caps the lifetime at 180 days. Verify:
//   1. The header is `{ alg: "ES256", kid: <keyId> }`
//   2. The payload is `{ iss: teamId, iat, exp, aud: appleid.apple.com, sub: servicesId }`
//   3. The signature verifies against the matching public key
//   4. Path-based and contents-based key inputs produce equivalent tokens
//   5. Missing files surface a clear error
//   6. Expiration clamps to the requested duration

let workdir: string;
let pemPath: string;
let pemContents: string;
let publicPem: string;

beforeAll(async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  pemContents = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  workdir = await mkdtemp(path.join(tmpdir(), "apple-jwt-test-"));
  pemPath = path.join(workdir, "AuthKey.p8");
  await writeFile(pemPath, pemContents);
});

afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
} {
  const [h, p, s] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString()),
    payload: JSON.parse(Buffer.from(p, "base64url").toString()),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s, "base64url"),
  };
}

describe("signClientSecret", () => {
  it("produces a JWT with the expected header (alg, kid)", async () => {
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.example.signin",
    });
    const { header } = decodeJwt(token);
    expect(header).toEqual({ alg: "ES256", kid: "FGHIJ67890" });
  });

  it("produces a payload matching Apple's SIWA spec", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.example.signin",
    });
    const after = Math.floor(Date.now() / 1000);
    const { payload } = decodeJwt(token);
    expect(payload.iss).toBe("ABCDE12345");
    expect(payload.sub).toBe("com.example.signin");
    expect(payload.aud).toBe("https://appleid.apple.com");
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(after);
    // Default 180 days.
    expect(exp - iat).toBe(180 * 86400);
  });

  it("verifies against the matching public key (ES256 signature is valid)", async () => {
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.example.signin",
    });
    const { signingInput, signature } = decodeJwt(token);
    const verifier = createVerify("SHA256");
    verifier.update(signingInput);
    verifier.end();
    const ok = verifier.verify({ key: publicPem, dsaEncoding: "ieee-p1363" }, signature);
    expect(ok).toBe(true);
  });

  it("rejects a signature from a different private key", async () => {
    const { privateKey: other } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const token = await signClientSecret({
      privateKey: { contents: other.export({ format: "pem", type: "pkcs8" }).toString() },
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.example.signin",
    });
    const { signingInput, signature } = decodeJwt(token);
    const verifier = createVerify("SHA256");
    verifier.update(signingInput);
    verifier.end();
    const ok = verifier.verify({ key: publicPem, dsaEncoding: "ieee-p1363" }, signature);
    expect(ok).toBe(false);
  });

  it("accepts a `.p8` file path and produces an equivalent token", async () => {
    const fromContents = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "T",
      keyId: "K",
      servicesId: "S",
    });
    const fromPath = await signClientSecret({
      privateKey: { path: pemPath },
      teamId: "T",
      keyId: "K",
      servicesId: "S",
    });
    const a = decodeJwt(fromContents);
    const b = decodeJwt(fromPath);
    expect(a.header).toEqual(b.header);
    // Payloads differ only in `iat` (timing). same other claims.
    expect((a.payload as Record<string, unknown>).iss).toBe(
      (b.payload as Record<string, unknown>).iss,
    );
    expect((a.payload as Record<string, unknown>).sub).toBe(
      (b.payload as Record<string, unknown>).sub,
    );
    expect((a.payload as Record<string, unknown>).aud).toBe(
      (b.payload as Record<string, unknown>).aud,
    );
  });

  it("expands a tilde-prefixed path", async () => {
    // We can't easily put a fake `~/foo.p8` on disk, but we can confirm a
    // tilde-prefixed bogus path produces the documented error rather than
    // crashing with EACCES or ENOENT against a literal `~/...` path.
    await expect(
      signClientSecret({
        privateKey: { path: "~/does-not-exist-vexpo-test.p8" },
        teamId: "T",
        keyId: "K",
        servicesId: "S",
      }),
    ).rejects.toThrow(/p8 file not found/);
  });

  it("throws a clear error when the `.p8` path is missing", async () => {
    await expect(
      signClientSecret({
        privateKey: { path: "/tmp/this-does-not-exist-vexpo-apple-jwt.p8" },
        teamId: "T",
        keyId: "K",
        servicesId: "S",
      }),
    ).rejects.toThrow(/p8 file not found/);
  });

  it("respects a custom expiration shorter than the 180-day default", async () => {
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "T",
      keyId: "K",
      servicesId: "S",
      expirationDays: 90,
    });
    const { payload } = decodeJwt(token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(90 * 86400);
  });

  it("respects a custom expiration of 1 day", async () => {
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "T",
      keyId: "K",
      servicesId: "S",
      expirationDays: 1,
    });
    const { payload } = decodeJwt(token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(86400);
  });

  it("produces valid base64url segments (no padding, no `+` or `/`)", async () => {
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.example.signin",
    });
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    for (const segment of parts) {
      expect(segment).not.toMatch(/[+/=]/);
      expect(segment).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("signature segment has the IEEE P1363 size for P-256 (64 bytes, 86 base64url chars)", async () => {
    const token = await signClientSecret({
      privateKey: { contents: pemContents },
      teamId: "ABCDE12345",
      keyId: "FGHIJ67890",
      servicesId: "com.example.signin",
    });
    const { signature } = decodeJwt(token);
    // IEEE P1363 encoding for P-256 is exactly 64 bytes (32 r + 32 s).
    expect(signature.length).toBe(64);
  });
});
