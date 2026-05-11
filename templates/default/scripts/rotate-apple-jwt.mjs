#!/usr/bin/env node
/**
 * Re-sign the Apple Sign In `client_secret` JWT and push it to a Convex
 * deployment. Designed for CI: reads everything from env vars, no disk IO,
 * no prompts.
 *
 * Required env:
 *   APPLE_P8_PRIVATE_KEY   PEM contents of the Sign In with Apple .p8
 *   APPLE_TEAM_ID          10-char Apple Team id
 *   APPLE_KEY_ID           10-char Sign In with Apple key id
 *   APPLE_SERVICES_ID      Services id (e.g. com.you.app.signin)
 *   CONVEX_DEPLOY_KEY      Convex deploy key for the target deployment
 *   CONVEX_DEPLOYMENT      (optional) name of the target deployment; defaults to whatever the deploy key is bound to
 *
 * Used by `.eas/workflows/rotate-apple-jwt.yml` on a 90-day cadence so Apple's
 * 180-day JWT cap never bites you. Runs on EAS infrastructure with env vars
 * read from EAS env (production, secret visibility). no GitHub repo secrets
 * needed.
 */

import { createSign } from "node:crypto";
import { spawnSync } from "node:child_process";

const required = [
  "APPLE_P8_PRIVATE_KEY",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_SERVICES_ID",
  "CONVEX_DEPLOY_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const privateKey = process.env.APPLE_P8_PRIVATE_KEY.replace(/\\n/g, "\n");
const teamId = process.env.APPLE_TEAM_ID;
const keyId = process.env.APPLE_KEY_ID;
const servicesId = process.env.APPLE_SERVICES_ID;

const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 180 * 86400,
  aud: "https://appleid.apple.com",
  sub: servicesId,
};
const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signingInput = `${headerB64}.${payloadB64}`;
const signer = createSign("SHA256");
signer.update(signingInput);
signer.end();
const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
const jwt = `${signingInput}.${signature}`;

console.log(
  `Signed JWT for ${servicesId} (expires ${new Date((now + 180 * 86400) * 1000).toISOString()})`,
);

const setEnv = (name, value) => {
  const args = ["convex", "env", "set", name, value];
  const res = spawnSync("npx", args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`convex env set ${name} failed (exit ${res.status})`);
    process.exit(1);
  }
};

setEnv("APPLE_CLIENT_ID", servicesId);
setEnv("APPLE_TEAM_ID", teamId);
setEnv("APPLE_KEY_ID", keyId);
setEnv("APPLE_CLIENT_SECRET", jwt);

console.log(
  "Pushed APPLE_CLIENT_ID + APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_CLIENT_SECRET to Convex",
);
