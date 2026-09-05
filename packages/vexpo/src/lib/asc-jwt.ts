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
