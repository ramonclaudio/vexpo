import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll } from "vitest";

/** Fields are filled in by `beforeAll`, so read them from inside a test. */
export function useEcKey(prefix: string): {
  pem: string;
  publicPem: string;
  pemPath: string;
  dir: string;
} {
  const key = { pem: "", publicPem: "", pemPath: "", dir: "" };

  beforeAll(async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    key.pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    key.publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    key.dir = await mkdtemp(path.join(tmpdir(), prefix));
    key.pemPath = path.join(key.dir, "AuthKey.p8");
    await writeFile(key.pemPath, key.pem);
  });

  afterAll(async () => {
    await rm(key.dir, { recursive: true, force: true });
  });

  return key;
}

export function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
} {
  const [h, p, s] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>,
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s, "base64url"),
  };
}
