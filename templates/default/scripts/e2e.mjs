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
 * And it answers Face ID. `deleteAccount` gates on
 * LocalAuthentication.authenticateAsync, and a simulator with no enrolled
 * biometric falls back to "Enter iPhone Passcode", a system dialog Maestro
 * cannot drive and no passcode can satisfy. So enroll a biometric up front,
 * then answer every prompt with a match for as long as the run lasts. Maestro
 * has no shell command, so the flow cannot do this itself, and without it
 * zz-delete-restore.yaml stalls on the passcode sheet.
 *
 * It also mutes the dev menu, for the same reason: the flows cannot. See
 * muteDevMenu below.
 *
 * Args pass through: `npm run e2e -- .maestro/launch.yaml` runs one flow, and
 * with none it runs the whole folder.
 */

import { spawn, spawnSync } from "node:child_process";
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

/**
 * Turn off the dev-client menu for this app on the booted simulator.
 *
 * The intro sheet appears about 13 seconds into every relaunch and never
 * closes by itself. It is a full-screen modal, so while it is up the app is out
 * of the accessibility hierarchy entirely and no screen id resolves. Dismissing
 * it per flow means every flow racing a sheet that has not appeared yet, so
 * stop it from showing at all.
 *
 * expo-dev-menu reads these off UserDefaults with `register(defaults:)` (see
 * expo-dev-menu/ios/Modules/DevMenuPreferences.swift), which only sets
 * fallbacks, so an explicit write to the app's own domain wins. Written per run
 * because a reinstall drops them, and read back because a silent miss here
 * looks like a mystery timeout three flows later.
 */
function muteDevMenu(bundleId) {
  const wanted = {
    EXDevMenuIsOnboardingFinished: true,
    EXDevMenuShowsAtLaunch: false,
    // The floating gear defaults to on and sits in the top-right of every
    // screenshot, over page titles.
    EXDevMenuShowFloatingActionButton: false,
  };

  // Write while the app is stopped: a live process can flush its cached
  // defaults over these on exit.
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

// Enroll a biometric, then post the change so the simulator picks it up.
notify("-s", "com.apple.BiometricKit.enrollmentChanged", "1");
notify("-p", "com.apple.BiometricKit.enrollmentChanged");

// The prompt only appears mid-flow, and there is no way to wait for it from
// here, so answer on a timer instead. A match posted while nothing is asking is
// a no-op, which makes polling safe.
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
  } catch {
    // already gone
  }
};
process.on("exit", stopFaceId);

// Folder order is not ours to assume. `maestro test .maestro/` plans the
// directory in REVERSE alphabetical order, so a folder run went
// zz -> tour -> launch -> auth, with the flow that creates the session running
// last and the three that need one running first. They came up on sign-in and
// failed there every time. `.maestro/config.yaml`'s executionOrder produced an
// empty plan, so the order is spelled out here instead, where it also documents
// the dependency.
const ORDERED_FLOWS = [
  ".maestro/guest.yaml", // starts from a wiped state and ends signed out
  ".maestro/auth.yaml", // creates the account and the session the rest need
  ".maestro/launch.yaml",
  ".maestro/tour.yaml",
  ".maestro/screens.yaml", // the screens no other flow reaches; changes nothing
  ".maestro/zz-delete-restore.yaml", // deletes the account, so it goes last
];

const flows = process.argv.slice(2);
const env = {
  ...process.env,
  JAVA_HOME: jdk,
  PATH: `${jdk}/bin:${process.env.PATH}`,
  MAESTRO_APP_ID: appId,
  MAESTRO_TEST_EMAIL: process.env.MAESTRO_TEST_EMAIL ?? `e2e+${Date.now()}@example.com`,
  // guest.yaml upgrades a guest into its own account, so it needs an address
  // auth.yaml is not also signing up with.
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
