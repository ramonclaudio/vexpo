# scripts

Build and maintenance scripts. Setup orchestration lives in the published `vexpo` CLI (run via `npx vexpo`), not here.

## What's in this directory

| Script                 | What it does                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev.mjs`              | Metro launcher behind `dev`, `start` and all three `ios` scripts. Passes `--private-key-path` once `certs/certificate.pem` exists, so signed dev manifests keep working. `--build <cmd...>` starts Metro, waits until it answers, then runs the build, which is why `run:ios` gets `--no-bundler`.                                                            |
| `e2e.mjs`              | Maestro runner behind `npm run e2e`. Finds a JDK (macOS ships none and Maestro is a JVM tool), reads the bundle id out of `.env.local`, mints a unique test email, builds the dev-client deep link the flows open, and resets the simulator keychain so a stale session can't leak into the next run. Args pass through: `npm run e2e -- .maestro/auth.yaml`. |
| `clean.ts`             | Trash + reinstall. `--metro` for cache-only nuke (Metro/Haste/node-compile-cache). `--state` also wipes `.setup-state.json`.                                                                                                                                                                                                                                  |
| `gen-update-cert.mjs`  | One-shot OTA update code-signing setup. Wraps `npx expo-updates codesigning:generate`, writes `certs/certificate.pem` (committed) and `../keys/private-key.pem` (gitignored). Run via `npm run updates:gen-cert -- --name "<Org>"`.                                                                                                                           |
| `rotate-apple-jwt.mjs` | Re-signs the Apple Sign In `client_secret` JWT from env vars only. Used by `.eas/workflows/rotate-apple-jwt.yml` every 90 days.                                                                                                                                                                                                                               |
| `_run.mjs`             | Runtime selector for `clean.ts`. Picks `bun` if available, falls back to `tsx`. Not used by the CLI.                                                                                                                                                                                                                                                          |

Anything else (preflight checks, env validation, version bumps) lives in the `vexpo` CLI or in `eas-cli` directly.

## Cleaning

```bash
npm run clean              # wipe + reinstall
npm run clean:metro        # just Metro/Haste/node-compile-cache
npm run clean:state        # also wipe .setup-state.json
```

Call it directly with `node scripts/_run.mjs scripts/clean.ts --metro`.

## Setup orchestration

Use the `vexpo` CLI:

```bash
npx vexpo lite               # dev-mode setup (Convex + Better Auth only)
npx vexpo full               # full provisioning to TestFlight-ready
```

Independent maintenance commands:

```bash
npx vexpo doctor             # cross-source drift detection
npx vexpo env push           # sync from .env.local + .env.prod to Convex and EAS
npx vexpo apple asc-key      # validate ASC API key
npx vexpo apple services-id  # attach SIWA capability to App ID
npx vexpo apple jwt          # sign client_secret JWT, push to Convex
```

The CLI itself ships from [`@ramonclaudio/vexpo` on npm](https://www.npmjs.com/package/@ramonclaudio/vexpo). Source lives at [`github.com/ramonclaudio/vexpo`](https://github.com/ramonclaudio/vexpo).
