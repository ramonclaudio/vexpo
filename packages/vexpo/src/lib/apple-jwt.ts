import { createSign } from "node:crypto";
import { access, readFile } from "node:fs/promises";

import { expandTilde } from "./path.ts";

export type AppleJwtArgs = {
  /** PEM-encoded private key contents OR a path to a `.p8` file. */
  privateKey: { contents: string } | { path: string };
  teamId: string;
  keyId: string;
  servicesId: string;
  /** Apple's max is 180 days. Default: 180. */
  expirationDays?: number;
};

async function readPrivateKey(source: AppleJwtArgs["privateKey"]): Promise<string> {
  if ("contents" in source) return source.contents;
  const path = expandTilde(source.path);
  try {
    await access(path);
  } catch {
    throw new Error(`p8 file not found at ${path}`);
  }
  return readFile(path, "utf8");
}

/**
 * Sign a Sign In with Apple ES256 JWT (`client_secret`) from a `.p8` private
 * key. Apple caps the lifetime at 180 days; default to that.
 */
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
  return `${signingInput}.${signature}`;
}
