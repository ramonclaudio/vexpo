// Fail if a package tarball would ship anything outside its `files` allowlist.
// This is the only guard against shipping source or secrets to npm: tests, src,
// env files, and keys all live next to `dist` and must never leave the repo.
//
// Usage: node .github/scripts/pack-guard.mjs <package-dir>

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: pack-guard.mjs <package-dir>");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const allowed = (pkg.files ?? []).map((entry) => entry.replace(/\/+$/, ""));

// npm always ships these regardless of `files`, so they are never offenders.
// Match npm-packlist's forced-include set by basename: exact `package.json`,
// and README/LICENSE/LICENCE with any single extension. A prefix match here
// would wave through `readme-secrets.env` or `package.json.bak`.
const isAlwaysShipped = (path) => {
  const name = basename(path);
  return name === "package.json" || /^(readme|license|licence)(\.[^/]+)?$/i.test(name);
};

const json = execFileSync("npm", ["pack", "--dry-run", "--json", "-w", pkg.name], {
  encoding: "utf8",
});
const [{ files }] = JSON.parse(json);

const isAllowed = (path) =>
  isAlwaysShipped(path) ||
  allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const offenders = files.map((file) => file.path).filter((path) => !isAllowed(path));
if (offenders.length > 0) {
  console.error(`::error::${pkg.name} tarball ships files outside the \`files\` allowlist:`);
  for (const path of offenders) console.error(`  ${path}`);
  process.exit(1);
}

console.log(`${pkg.name}: ${files.length} files, all inside the \`files\` allowlist.`);
