#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, "..");
const CERT = resolve(PROJECT, "certs", "certificate.pem");
const KEY = resolve(PROJECT, "..", "keys", "private-key.pem");

const args = process.argv.slice(2);
const flagIndex = args.indexOf("--name");
const flagValue = flagIndex >= 0 ? args[flagIndex + 1] : undefined;

if (existsSync(CERT)) {
  console.error(`Certificate already exists at ${CERT}`);
  console.error("Delete it (and the matching private key) before regenerating.");
  process.exit(1);
}

const commonName = await resolveCommonName(flagValue);

const result = spawnSync(
  "npx",
  [
    "expo-updates",
    "codesigning:generate",
    "--certificate-output-directory",
    "certs",
    "--key-output-directory",
    "../keys",
    "--certificate-validity-duration-years",
    "10",
    "--certificate-common-name",
    commonName,
  ],
  { cwd: PROJECT, stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\n--- Next steps ---");
console.log(`1. Commit ${CERT.replace(`${PROJECT}/`, "")} (it's a public cert).`);
console.log(`2. Upload the private key to EAS as a file-type secret:`);
console.log(`   eas env:create --environment production --visibility secret \\`);
console.log(`     --type file --name EAS_UPDATE_PRIVATE_KEY --value ${KEY}`);
console.log(
  `3. Keep ${KEY} off committed surface. It lands in ../keys/, outside the repo, so git never sees it.`,
);
console.log(
  `4. The next \`expo prebuild\` picks up the cert automatically. Run \`npm run prebuild\`.`,
);
console.log(
  `5. Dev serving now signs manifests: \`npm run dev\`/\`start\`/\`ios\` pass the key automatically via scripts/dev.mjs.`,
);

async function resolveCommonName(provided) {
  if (provided && provided.trim().length > 0) return provided.trim();
  if (!process.stdin.isTTY) {
    console.error("Provide --name '<Organization Name>' when running non-interactively.");
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Certificate common name (organization): ")).trim();
  rl.close();
  if (answer.length === 0) {
    console.error("Common name is required.");
    process.exit(1);
  }
  return answer;
}
