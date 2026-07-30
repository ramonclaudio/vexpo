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
 *
 * `--build <cmd...>` starts Metro, waits until it answers, then runs <cmd>.
 * The iOS scripts need that ordering. They pass `--no-bundler` to
 * `expo run:ios` precisely because Metro has to start here to get the signing
 * key, and `run:ios` installs AND OPENS the app, so chaining it before Metro
 * with `&&` means the app always launches against a dead port and lands on
 * "There was a problem loading the project". Everything before `--build` still
 * goes to `expo start`. Starting Metro first also warms the bundler while
 * Xcode compiles, so the first load after install is a cache hit.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CERT = resolve(PROJECT, "certs", "certificate.pem");
const KEY = resolve(PROJECT, "..", "keys", "private-key.pem");

const DEFAULT_PORT = 8081;
// A cold start with --clear is the slow case and still lands well inside this.
const READY_TIMEOUT_MS = 90_000;
const POLL_MS = 400;

const argv = process.argv.slice(2);
const split = argv.indexOf("--build");
const startArgs = split === -1 ? argv : argv.slice(0, split);
const buildCmd = split === -1 ? [] : argv.slice(split + 1);

if (split !== -1 && buildCmd.length === 0) {
  console.error(
    "--build needs a command to run once Metro is up, for example:\n" +
      "  node scripts/dev.mjs --build expo run:ios --no-bundler",
  );
  process.exit(1);
}

const args = ["expo", "start", "--dev-client", ...startArgs];

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

/** Whichever port Metro will bind, so readiness polls the one it is on. */
function metroPort(flags) {
  const i = flags.findIndex((a) => a === "--port" || a === "-p");
  const inline = flags.find((a) => a.startsWith("--port="));
  const raw =
    (i === -1 ? undefined : flags[i + 1]) ??
    inline?.slice("--port=".length) ??
    process.env.EXPO_PACKAGER_PORT ??
    process.env.RCT_METRO_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

/**
 * Whether Metro is serving on this port. The /status body is the packager's own
 * readiness handshake, which beats a bare TCP connect: the socket accepts
 * before the server can serve a bundle. It also tells Metro apart from whatever
 * else might hold the port.
 */
async function answering(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    return (await res.text()).includes("packager-status:running");
  } catch {
    return false;
  }
}

/** True once Metro answers, false if it dies or never comes up. */
async function metroReady(port, child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (await answering(port)) return true;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return false;
}

if (!buildCmd.length) {
  const metro = spawn("npx", args, { cwd: PROJECT, stdio: "inherit" });
  metro.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else {
  const port = metroPort(startArgs);

  // A Metro already on this port gets reused, not raced. `ios:dev` skips the
  // cache wipe, so running it with Metro already up is the normal case: a
  // second `expo start` there prompts to move to 8082 while the build still
  // talks to 8081, and whichever one loses takes this wrapper down with it.
  const own = (await answering(port))
    ? null
    : spawn("npx", args, { cwd: PROJECT, stdio: "inherit" });

  if (own) {
    own.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
    if (!(await metroReady(port, own))) {
      console.error(
        `\nMetro is not answering on port ${port} after ${READY_TIMEOUT_MS / 1000}s, so\n` +
          `\`${buildCmd.join(" ")}\` did not start. Either Metro failed above, or something\n` +
          `else holds the port: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      );
      own.kill("SIGTERM");
      process.exit(1);
    }
  } else {
    console.log(`Metro is already serving on port ${port}, reusing it.`);
  }

  const build = spawn(buildCmd[0], buildCmd.slice(1), { cwd: PROJECT, stdio: "inherit" });
  build.on("exit", (code, signal) => {
    const status = code ?? (signal ? 1 : 0);
    if (status !== 0) {
      console.error(`\n${buildCmd[0]} exited ${status}.${own ? " Stopping Metro." : ""}`);
      own?.kill("SIGTERM");
      process.exit(status);
    }
    // Our own Metro keeps the terminal, which is where the old
    // `run:ios && npm run dev` chain ended up anyway. Someone else's does not.
    if (!own) process.exit(0);
  });
}
