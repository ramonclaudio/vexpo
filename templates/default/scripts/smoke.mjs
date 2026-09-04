#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS = "ios/build/Build/Products/Release-iphonesimulator";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: PROJECT, stdio: "inherit", ...opts });
  if (res.status !== 0) {
    console.error(`\n\`${cmd} ${args.join(" ")}\` failed.`);
    process.exit(res.status ?? 1);
  }
  return res;
}

function capture(cmd, args) {
  return spawnSync(cmd, args, { cwd: PROJECT, encoding: "utf8" }).stdout?.trim() ?? "";
}

function scheme() {
  const ws = readdirSync(join(PROJECT, "ios")).find((f) => f.endsWith(".xcworkspace"));
  if (!ws) {
    console.error(
      "No .xcworkspace under ios/ after prebuild. Check that `npx expo prebuild --platform ios`\n" +
        "finished and that CocoaPods installed.",
    );
    process.exit(1);
  }
  return ws.replace(/\.xcworkspace$/, "");
}

function bootedDevice() {
  const booted = capture("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  const runtimes = JSON.parse(booted || '{"devices":{}}').devices;
  for (const list of Object.values(runtimes)) {
    if (list.length > 0) return list[0].udid;
  }
  const all = JSON.parse(
    capture("xcrun", ["simctl", "list", "devices", "available", "-j"]),
  ).devices;
  const existing = Object.entries(all)
    .filter(([runtime]) => runtime.includes("SimRuntime.iOS"))
    .flatMap(([, list]) => list)
    .filter((d) => d.name.startsWith("iPhone"));
  const udid = existing.at(-1)?.udid ?? createDevice();
  run("xcrun", ["simctl", "boot", udid]);
  run("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  return udid;
}

function encodeVersion(version) {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return major * 65536 + minor * 256 + patch;
}

function createDevice() {
  const runtime = JSON.parse(capture("xcrun", ["simctl", "list", "runtimes", "-j"]))
    .runtimes.filter((r) => r.isAvailable && r.identifier.includes("SimRuntime.iOS"))
    .toSorted((a, b) => encodeVersion(a.version) - encodeVersion(b.version))
    .at(-1);
  if (!runtime) {
    console.error(
      "No iOS simulator runtime is installed, so there is nothing to create a device on.\n" +
        "Install one with `xcodebuild -downloadPlatform iOS`, then run this again.",
    );
    process.exit(1);
  }
  const wanted = encodeVersion(runtime.version);
  const type = JSON.parse(capture("xcrun", ["simctl", "list", "devicetypes", "-j"]))
    .devicetypes.filter(
      (t) =>
        t.name.startsWith("iPhone") &&
        t.minRuntimeVersion <= wanted &&
        (t.maxRuntimeVersion ?? Infinity) >= wanted,
    )
    .toSorted((a, b) => a.minRuntimeVersion - b.minRuntimeVersion)
    .at(-1);
  if (!type) {
    console.error(
      `No iPhone device type supports ${runtime.name}. Open Xcode > Settings > Components and\n` +
        "install a matching simulator, or create a device yourself and boot it.",
    );
    process.exit(1);
  }
  console.log(`### create simulator ${type.name} on ${runtime.name}`);
  return capture("xcrun", ["simctl", "create", "vexpo-smoke", type.identifier, runtime.identifier]);
}

const udid = bootedDevice();

console.log("### prebuild");
run("npx", ["expo", "prebuild", "--clean", "--platform", "ios"]);

const name = scheme();

console.log("### build");
run("xcodebuild", [
  "-workspace",
  `ios/${name}.xcworkspace`,
  "-scheme",
  name,
  "-configuration",
  "Release",
  "-sdk",
  "iphonesimulator",
  "-derivedDataPath",
  "ios/build",
  "-destination",
  `id=${udid}`,
  "CODE_SIGN_IDENTITY=-",
  "CODE_SIGNING_REQUIRED=NO",
  "CODE_SIGNING_ALLOWED=YES",
  "CODE_SIGN_STYLE=Manual",
  "DEVELOPMENT_TEAM=",
  "PROVISIONING_PROFILE_SPECIFIER=",
  "ONLY_ACTIVE_ARCH=YES",
  "build",
]);

const app = readdirSync(join(PROJECT, PRODUCTS)).find((f) => f.endsWith(".app"));
if (!app) {
  console.error(`No .app under ${PRODUCTS}. The build reported success but produced nothing.`);
  process.exit(1);
}
const appPath = join(PROJECT, PRODUCTS, app);
const appId = capture("plutil", [
  "-extract",
  "CFBundleIdentifier",
  "raw",
  "-o",
  "-",
  join(appPath, "Info.plist"),
]);

console.log(`### install ${appId}`);
run("xcrun", ["simctl", "install", udid, appPath]);

console.log("### smoke flow");
run("node", [join(PROJECT, "scripts", "e2e.mjs"), ".maestro/smoke.yaml"], {
  env: { ...process.env, MAESTRO_APP_ID: appId },
});
