import { signEs256 } from "./jwt.ts";

export type AscCredentials = {
  issuerId: string;
  keyId: string;
  p8Path: string;
};

// Apple caps App Store Connect tokens at 20 minutes.
const TTL_SECONDS = 18 * 60;

export async function signAscToken(
  creds: AscCredentials,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TTL_SECONDS;
  const header = { alg: "ES256", kid: creds.keyId, typ: "JWT" };
  const payload = { iss: creds.issuerId, iat: now, exp, aud: "appstoreconnect-v1" };
  const token = await signEs256(creds.p8Path, header, payload);
  return { token, expiresAt: exp };
}
