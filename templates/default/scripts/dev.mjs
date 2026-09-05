#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CERT = resolve(PROJECT, "certs", "certificate.pem");
const KEY = resolve(PROJECT, "..", "keys", "private-key.pem");

const DEFAULT_PORT = 8081;
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
    if (!own) process.exit(0);
  });
}
