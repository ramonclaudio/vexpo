import { createSign } from "node:crypto";
import { access, readFile } from "node:fs/promises";

import { expandTilde } from "./path.ts";

export type PrivateKeySource = { contents: string } | { path: string };

async function readPrivateKey(source: PrivateKeySource): Promise<string> {
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
 * Sign an ES256 JWT from a `.p8` private key. Apple wants the raw r||s
 * signature (`ieee-p1363`), not the ASN.1/DER default. Callers build the claims.
 */
export async function signEs256(
  key: PrivateKeySource,
  header: Record<string, string | number>,
  payload: Record<string, string | number>,
): Promise<string> {
  const privateKey = await readPrivateKey(key);
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
