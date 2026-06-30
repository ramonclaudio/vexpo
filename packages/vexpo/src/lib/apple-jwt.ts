import { signEs256, type PrivateKeySource } from "./jwt.ts";

export type AppleJwtArgs = {
  privateKey: PrivateKeySource;
  teamId: string;
  keyId: string;
  servicesId: string;
  /** Apple's max is 180 days. Default: 180. */
  expirationDays?: number;
};

export async function signClientSecret(opts: AppleJwtArgs): Promise<string> {
  const days = opts.expirationDays ?? 180;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: opts.keyId };
  const payload = {
    iss: opts.teamId,
    iat: now,
    exp: now + days * 86400,
    aud: "https://appleid.apple.com",
    sub: opts.servicesId,
  };
  return signEs256(opts.privateKey, header, payload);
}
