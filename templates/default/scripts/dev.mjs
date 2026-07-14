#!/usr/bin/env node
/**
 * Metro launcher that keeps the dev loop working after OTA code signing.
 *
 * Once `npm run updates:gen-cert` lands `certs/certificate.pem`, prebuild
 * bakes it into the dev-client binary, which then demands SIGNED dev
 * manifests (`expo-expect-signature`). `expo start` has no default key
 * lookup: with the cert wired and no `--private-key-path` it throws
 * "Must specify --private-key-path argument to sign development manifest".
 * This wrapper passes the key automatically, so `npm run dev` / `start` /
 * `ios` keep working with zero manual flags.
 *
 * No cert yet (fresh checkout, pre-gen-cert): plain `expo start --dev-client`,
 * unchanged behavior.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CERT = resolve(PROJECT, "certs", "certificate.pem");
const KEY = resolve(PROJECT, "..", "keys", "private-key.pem");

const args = ["expo", "start", "--dev-client", ...process.argv.slice(2)];

if (existsSync(CERT)) {
  if (!existsSync(KEY)) {
    console.error(
      `certs/certificate.pem is wired into the build, but the signing key is missing at ${KEY}.\n` +
        "The dev client will reject Metro's unsigned manifest. Either restore the key\n" +
        "(EAS holds it as the EAS_UPDATE_PRIVATE_KEY file secret) or remove\n" +
        "certs/certificate.pem to develop unsigned.",
    );
    process.exit(1);
  }
  args.push("--private-key-path", KEY);
}

const proc = spawn("npx", args, { cwd: PROJECT, stdio: "inherit" });
proc.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
