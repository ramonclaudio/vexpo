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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// The signed JWT is a live 180-day Apple credential, so it never lands on argv
// where any process on the runner could read it from the process table. Write
// all four vars to a 0600 file in a fresh 0700 mkdtemp dir and pass it via
// `--from-file`, mirroring the CLI's `envSetFromFile`.
const vars = {
  APPLE_CLIENT_ID: servicesId,
  APPLE_TEAM_ID: teamId,
  APPLE_KEY_ID: keyId,
  APPLE_CLIENT_SECRET: jwt,
};
const dir = mkdtempSync(join(tmpdir(), "vexpo-env-"));
const file = join(dir, "convex.env");
try {
  writeFileSync(
    file,
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const res = spawnSync("npx", ["convex", "env", "set", "--from-file", file, "--force"], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.error(`convex env set --from-file failed (exit ${res.status})`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  "Pushed APPLE_CLIENT_ID + APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_CLIENT_SECRET to Convex",
);
