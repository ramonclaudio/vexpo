import { signEs256 } from "./jwt.ts";

// Apple's limit for a Sign in with Apple client secret.
export const CLIENT_SECRET_DAYS = 180;

export async function signClientSecret(opts: {
  p8Path: string;
  teamId: string;
  keyId: string;
  servicesId: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: opts.keyId };
  const payload = {
    iss: opts.teamId,
    iat: now,
    exp: now + CLIENT_SECRET_DAYS * 86400,
    aud: "https://appleid.apple.com",
    sub: opts.servicesId,
  };
  return signEs256(opts.p8Path, header, payload);
}
