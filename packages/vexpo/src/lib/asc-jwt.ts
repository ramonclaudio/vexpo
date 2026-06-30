/**
 * ES256 JWT signer for the App Store Connect API. Apple caps tokens at 20
 * minutes; we default to 18 minutes (1080s) with margin.
 *
 * The header `alg=ES256` and `typ=JWT` plus `kid=keyId` are required.
 * The payload requires `iss=issuerId`, `iat`, `exp`, and `aud="appstoreconnect-v1"`.
 *
 * https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests
 */

import { signEs256, type PrivateKeySource } from "./jwt.ts";

export type AscJwtArgs = {
  issuerId: string;
  keyId: string;
  privateKey: PrivateKeySource;
  ttlSeconds?: number;
};

const DEFAULT_TTL = 18 * 60;
const MAX_TTL = 20 * 60;

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
  const token = await signEs256(opts.privateKey, header, payload);
  return { token, expiresAt: exp };
}
