/**
 * ES256 JWT signer for the App Store Connect API. Apple caps tokens at 20
 * minutes; we default to 18 minutes (1080s) with margin. Tokens are signed
 * with a `.p8` private key downloaded from App Store Connect → Users and
 * Access → Integrations → App Store Connect API.
 *
 * The header `alg=ES256` and `typ=JWT` plus `kid=keyId` are required.
 * The payload requires `iss=issuerId`, `iat`, `exp`, and `aud="appstoreconnect-v1"`.
 *
 * https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests
 */

import { createSign } from "node:crypto";
import { access, readFile } from "node:fs/promises";

import { expandTilde } from "./path.ts";

export type AscJwtArgs = {
  issuerId: string;
  keyId: string;
  privateKey: { contents: string } | { path: string };
  ttlSeconds?: number;
};

const DEFAULT_TTL = 18 * 60;
const MAX_TTL = 20 * 60;

async function readPrivateKey(source: AscJwtArgs["privateKey"]): Promise<string> {
  if ("contents" in source) return source.contents;
  const path = expandTilde(source.path);
  try {
    await access(path);
  } catch {
    throw new Error(`p8 file not found at ${path}`);
  }
  return readFile(path, "utf8");
}

export async function signAscToken(
  opts: AscJwtArgs,
): Promise<{ token: string; expiresAt: number }> {
  const ttl = Math.min(opts.ttlSeconds ?? DEFAULT_TTL, MAX_TTL);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const header = { alg: "ES256", kid: opts.keyId, typ: "JWT" };
  const payload = {
    iss: opts.issuerId,
    iat: now,
    exp,
    aud: "appstoreconnect-v1",
  };
  const privateKey = await readPrivateKey(opts.privateKey);
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return { token: `${signingInput}.${signature}`, expiresAt: exp };
}
