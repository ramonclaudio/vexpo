#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const baseId = envValue(resolve(PROJECT, ".env.local"), "EXPO_PUBLIC_APP_BUNDLE_ID");
const appId = process.env.MAESTRO_APP_ID ?? (baseId ? `${baseId}.dev` : undefined);
if (!appId) {
  console.error(
    "MAESTRO_APP_ID is unset and EXPO_PUBLIC_APP_BUNDLE_ID is not in .env.local, so the\n" +
      "flows have no appId to launch. Copy .env.example to .env.local, or export\n" +
      "MAESTRO_APP_ID=<bundle id>.\n\n" +
      "The local build is the development variant, so its id is <bundle id>.dev. A build\n" +
      "from the preview or production profile uses the id without the suffix.",
  );
  process.exit(1);
}

const maestro = existsSync(`${process.env.HOME}/.maestro/bin/maestro`)
  ? `${process.env.HOME}/.maestro/bin/maestro`
  : "maestro";

function devUrl() {
  if (process.env.MAESTRO_DEV_URL) return process.env.MAESTRO_DEV_URL;
  const base =
    readFileSync(resolve(PROJECT, "app.config.ts"), "utf8").match(
      /const SCHEME = ["']([^"']+)["'];/,
    )?.[1] ?? "exp";
  const scheme = `${base}dev`;
  const port = process.env.EXPO_PACKAGER_PORT ?? process.env.RCT_METRO_PORT ?? "8081";
  const host = process.env.MAESTRO_DEV_HOST ?? "localhost";
  const target = encodeURIComponent(`http://${host}:${port}`);
  return `exp+${scheme}://expo-development-client/?url=${target}`;
}

spawnSync("xcrun", ["simctl", "keychain", "booted", "reset"], { stdio: "ignore" });

function muteDevMenu(bundleId) {
  const wanted = {
    EXDevMenuIsOnboardingFinished: true,
    EXDevMenuShowsAtLaunch: false,
    EXDevMenuShowFloatingActionButton: false,
  };

  spawnSync("xcrun", ["simctl", "terminate", "booted", bundleId], { stdio: "ignore" });

  for (const [key, value] of Object.entries(wanted)) {
    spawnSync(
      "xcrun",
      ["simctl", "spawn", "booted", "defaults", "write", bundleId, key, "-bool", String(value)],
      { stdio: "ignore" },
    );
  }

  const missed = Object.entries(wanted).filter(([key, value]) => {
    const read = spawnSync(
      "xcrun",
      ["simctl", "spawn", "booted", "defaults", "read", bundleId, key],
      { encoding: "utf8" },
    );
    return read.stdout?.trim() !== (value ? "1" : "0");
  });

  if (missed.length > 0) {
    console.error(
      `Could not turn off the dev menu for ${bundleId}: ${missed.map(([k]) => k).join(", ")}.\n` +
        "The dev-menu sheet covers the whole app, so the flows would fail on screens that\n" +
        "are actually on screen. Check the key names still match\n" +
        "expo-dev-menu/ios/Modules/DevMenuPreferences.swift, and that the app is installed\n" +
        "on the booted simulator.",
    );
    process.exit(1);
  }
}

muteDevMenu(appId);

const notify = (...args) =>
  spawnSync("xcrun", ["simctl", "spawn", "booted", "notifyutil", ...args], { stdio: "ignore" });

notify("-s", "com.apple.BiometricKit.enrollmentChanged", "1");
notify("-p", "com.apple.BiometricKit.enrollmentChanged");

const faceId = spawn(
  "sh",
  [
    "-c",
    "while :; do xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match >/dev/null 2>&1; sleep 2; done",
  ],
  { stdio: "ignore", detached: true },
);
const stopFaceId = () => {
  try {
    process.kill(-faceId.pid);
  } catch {}
};
process.on("exit", stopFaceId);

const ORDERED_FLOWS = [
  ".maestro/guest.yaml",
  ".maestro/auth.yaml",
  ".maestro/launch.yaml",
  ".maestro/tour.yaml",
  ".maestro/screens.yaml",
  ".maestro/zz-delete-restore.yaml",
];

const flows = process.argv.slice(2);
const env = {
  ...process.env,
  JAVA_HOME: jdk,
  PATH: `${jdk}/bin:${process.env.PATH}`,
  MAESTRO_APP_ID: appId,
  MAESTRO_TEST_EMAIL: process.env.MAESTRO_TEST_EMAIL ?? `e2e+${Date.now()}@example.com`,
  MAESTRO_GUEST_EMAIL: process.env.MAESTRO_GUEST_EMAIL ?? `e2e-guest+${Date.now()}@example.com`,
  MAESTRO_TEST_PASSWORD: process.env.MAESTRO_TEST_PASSWORD ?? "maestro-test-pw",
  MAESTRO_DEV_URL: devUrl(),
};

console.log(`appId   ${env.MAESTRO_APP_ID}`);
console.log(`email   ${env.MAESTRO_TEST_EMAIL}`);
console.log(`guest   ${env.MAESTRO_GUEST_EMAIL}`);
console.log(`devUrl  ${env.MAESTRO_DEV_URL}`);
console.log(`jdk     ${jdk}\n`);

const run = spawnSync(maestro, ["test", ...(flows.length ? flows : ORDERED_FLOWS)], {
  cwd: PROJECT,
  stdio: "inherit",
  env,
});
stopFaceId();
if (run.error) {
  console.error(
    `Could not run \`${maestro}\`: ${run.error.message}\n` +
      "Install it with `curl -fsSL https://get.maestro.mobile.dev | bash`, or put the\n" +
      "binary on PATH. It is not an npm dependency, so a fresh checkout will not have it.",
  );
  process.exit(1);
}
process.exit(run.status ?? 1);
