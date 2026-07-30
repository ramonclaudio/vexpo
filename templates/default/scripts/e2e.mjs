#!/usr/bin/env node
/**
 * Maestro runner. Supplies the three things a local run needs and the flows
 * cannot supply themselves, then hands off to `maestro test`.
 *
 * 1. A JDK. Maestro is a JVM tool and dies with "Unable to locate a Java
 *    Runtime" when nothing is on PATH. macOS ships no JDK, and a Homebrew
 *    openjdk is not symlinked into /Library/Java/JavaVirtualMachines unless you
 *    ran `brew link`, so `/usr/libexec/java_home` cannot see it either. This
 *    looks in the usual places and sets JAVA_HOME itself.
 * 2. `MAESTRO_APP_ID`, which every flow reads as `appId`. EAS injects it from
 *    EXPO_PUBLIC_APP_BUNDLE_ID; locally it comes from .env.local.
 * 3. `MAESTRO_TEST_EMAIL` / `MAESTRO_TEST_PASSWORD`. auth.yaml creates a fresh
 *    account, so the email has to be unique per run. Pass your own to re-use an
 *    account across runs.
 *
 * It also resets the simulator keychain first. `clearState` drops localStorage
 * but leaves Better Auth's session cookie in the keychain, so without this a
 * relaunch comes up already signed in and auth.yaml asserts against the wrong
 * screen.
 *
 * Args pass through: `npm run e2e -- .maestro/launch.yaml` runs one flow, and
 * with none it runs the whole folder.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Homebrew's openjdk (current, then the LTS pin), then anything java_home knows.
const JDK_CANDIDATES = [
  "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
];

function findJdk() {
  if (process.env.JAVA_HOME && existsSync(`${process.env.JAVA_HOME}/bin/java`)) {
    return process.env.JAVA_HOME;
  }
  const found = JDK_CANDIDATES.find((p) => existsSync(`${p}/bin/java`));
  if (found) return found;
  const probe = spawnSync("/usr/libexec/java_home", { encoding: "utf8" });
  const home = probe.stdout?.trim();
  return home && existsSync(`${home}/bin/java`) ? home : null;
}

function envValue(file, key) {
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  return line
    ? line
        .slice(key.length + 1)
        .replace(/^["']|["']$/g, "")
        .trim()
    : null;
}

const jdk = findJdk();
if (!jdk) {
  console.error(
    "Maestro needs a JDK and none was found. Install one with `brew install openjdk`,\n" +
      "or set JAVA_HOME to an existing JDK. A Homebrew openjdk does not need `brew link`:\n" +
      "this script looks under /opt/homebrew/opt/openjdk directly.",
  );
  process.exit(1);
}

const appId =
  process.env.MAESTRO_APP_ID ??
  envValue(resolve(PROJECT, ".env.local"), "EXPO_PUBLIC_APP_BUNDLE_ID");
if (!appId) {
  console.error(
    "MAESTRO_APP_ID is unset and EXPO_PUBLIC_APP_BUNDLE_ID is not in .env.local, so the\n" +
      "flows have no appId to launch. Copy .env.example to .env.local, or export\n" +
      "MAESTRO_APP_ID=<bundle id>.",
  );
  process.exit(1);
}

const maestro = existsSync(`${process.env.HOME}/.maestro/bin/maestro`)
  ? `${process.env.HOME}/.maestro/bin/maestro`
  : "maestro";

/**
 * The dev-client deep link, which auth.yaml opens instead of tapping the
 * launcher's server row. clearState drops the dev client's last-opened bundle,
 * and the picker's own auto-discovery scans the local network and never resolves
 * on a simulator, so this is the only reliable way back into the bundle. Same
 * URL shape `expo run:ios` opens. localhost works because the simulator shares
 * the host's network stack; a physical device needs the LAN IP instead.
 */
function devUrl() {
  if (process.env.MAESTRO_DEV_URL) return process.env.MAESTRO_DEV_URL;
  const scheme =
    readFileSync(resolve(PROJECT, "app.config.ts"), "utf8").match(
      /scheme:\s*["']([^"']+)["']/,
    )?.[1] ?? "exp";
  const port = process.env.EXPO_PACKAGER_PORT ?? process.env.RCT_METRO_PORT ?? "8081";
  const host = process.env.MAESTRO_DEV_HOST ?? "localhost";
  const target = encodeURIComponent(`http://${host}:${port}`);
  return `exp+${scheme}://expo-development-client/?url=${target}`;
}

// clearState leaves the session cookie behind, so a stale one has to go first.
spawnSync("xcrun", ["simctl", "keychain", "booted", "reset"], { stdio: "ignore" });

const flows = process.argv.slice(2);
const env = {
  ...process.env,
  JAVA_HOME: jdk,
  PATH: `${jdk}/bin:${process.env.PATH}`,
  MAESTRO_APP_ID: appId,
  MAESTRO_TEST_EMAIL: process.env.MAESTRO_TEST_EMAIL ?? `e2e+${Date.now()}@example.com`,
  MAESTRO_TEST_PASSWORD: process.env.MAESTRO_TEST_PASSWORD ?? "maestro-test-pw",
  MAESTRO_DEV_URL: devUrl(),
};

console.log(`appId   ${env.MAESTRO_APP_ID}`);
console.log(`email   ${env.MAESTRO_TEST_EMAIL}`);
console.log(`devUrl  ${env.MAESTRO_DEV_URL}`);
console.log(`jdk     ${jdk}\n`);

const run = spawnSync(maestro, ["test", ...(flows.length ? flows : [".maestro/"])], {
  cwd: PROJECT,
  stdio: "inherit",
  env,
});
if (run.error) {
  console.error(
    `Could not run \`${maestro}\`: ${run.error.message}\n` +
      "Install it with `curl -fsSL https://get.maestro.mobile.dev | bash`, or put the\n" +
      "binary on PATH. It is not an npm dependency, so a fresh checkout will not have it.",
  );
  process.exit(1);
}
process.exit(run.status ?? 1);
