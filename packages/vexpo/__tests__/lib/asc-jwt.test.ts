import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signAscToken } from "../../src/lib/asc-jwt";

let workdir: string;
let pemPath: string;
let pemContents: string;
let publicPem: string;

beforeAll(async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  pemContents = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  workdir = await mkdtemp(path.join(tmpdir(), "asc-jwt-test-"));
  pemPath = path.join(workdir, "AuthKey.p8");
  await writeFile(pemPath, pemContents);
});

afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const [h, p] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString()),
    payload: JSON.parse(Buffer.from(p, "base64url").toString()),
  };
}

describe("signAscToken", () => {
  it("produces a JWT with the expected header and payload", async () => {
    const { token, expiresAt } = await signAscToken({
      issuerId: "00000000-0000-0000-0000-000000000000",
      keyId: "ABCDE12345",
      privateKey: { contents: pemContents },
      ttlSeconds: 600,
    });
    const { header, payload } = decodeJwt(token);
    expect(header).toEqual({ alg: "ES256", kid: "ABCDE12345", typ: "JWT" });
    expect(payload.iss).toBe("00000000-0000-0000-0000-000000000000");
    expect(payload.aud).toBe("appstoreconnect-v1");
    expect(payload.exp).toBe(expiresAt);
    const now = Math.floor(Date.now() / 1000);
    expect(payload.iat).toBeLessThanOrEqual(now);
    expect(payload.exp).toBeGreaterThan(now);
  });

  it("caps ttl at 20 minutes even when caller asks for more", async () => {
    const { token, expiresAt } = await signAscToken({
      issuerId: "x",
      keyId: "y",
      privateKey: { contents: pemContents },
      ttlSeconds: 60 * 60,
    });
    const { payload } = decodeJwt(token);
    const ttl = (payload.exp as number) - (payload.iat as number);
    expect(ttl).toBeLessThanOrEqual(20 * 60);
    expect(expiresAt).toBe(payload.exp);
  });

  it("reads from a .p8 path when given", async () => {
    const { token } = await signAscToken({
      issuerId: "x",
      keyId: "y",
      privateKey: { path: pemPath },
    });
    const { header } = decodeJwt(token);
    expect(header.alg).toBe("ES256");
  });

  it("throws a clear error for missing .p8 path", async () => {
    await expect(
      signAscToken({
        issuerId: "x",
        keyId: "y",
        privateKey: { path: path.join(workdir, "missing.p8") },
      }),
    ).rejects.toThrow(/p8 file not found/);
  });

  it("produces a signature verifiable with the matching public key", async () => {
    const { token } = await signAscToken({
      issuerId: "x",
      keyId: "y",
      privateKey: { contents: pemContents },
    });
    const [h, p, sig] = token.split(".");
    const verifier = createVerify("SHA256");
    verifier.update(`${h}.${p}`);
    verifier.end();
    const ok = verifier.verify(
      { key: publicPem, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    );
    expect(ok).toBe(true);
  });
});
