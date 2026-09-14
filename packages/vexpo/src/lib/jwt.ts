import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expandTilde } from "./path.ts";

export async function signEs256(
  p8Path: string,
  header: Record<string, string | number>,
  payload: Record<string, string | number>,
): Promise<string> {
  const path = expandTilde(p8Path);
  let privateKey: string;
  try {
    privateKey = await readFile(path, "utf8");
  } catch {
    throw new Error(`p8 file not found at ${path}`);
  }
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
