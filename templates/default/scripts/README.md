# scripts

These are the app's build and maintenance scripts. Setup runs through the published `vexpo` CLI (`npx vexpo`), not through anything here.

## What's in this directory

| Script                 | What it does                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev.mjs`              | Metro launcher behind `dev`, `start` and all three `ios` scripts. Passes `--private-key-path` once `certs/certificate.pem` exists, so signed dev manifests keep working. `--build <cmd...>` starts Metro, waits until it answers, then runs the build. That's why `run:ios` gets `--no-bundler`.                                                                    |
| `e2e.mjs`              | Maestro runner behind `npm run e2e`. Finds a JDK (macOS ships none and Maestro is a JVM tool), reads the bundle id out of `.env.local`, makes up a unique test email, builds the dev-client deep link the flows open, and resets the simulator keychain so a stale session can't leak into the next run. Args pass through, so `npm run e2e -- .maestro/auth.yaml`. |
| `clean.mjs`            | Trashes `node_modules`, `ios` and the caches, then reinstalls. `--metro` clears only the Metro, Haste and node-compile caches, and `--state` also removes `.setup-state.json`.                                                                                                                                                                                      |
| `gen-update-cert.mjs`  | Run once to set up code signing for over-the-air (OTA) updates. Wraps `npx expo-updates codesigning:generate`, writes `certs/certificate.pem` (committed) and `../keys/private-key.pem` (gitignored). Run it with `npm run updates:gen-cert -- --name "<Org>"`.                                                                                                     |
| `rotate-apple-jwt.mjs` | Re-signs the Apple Sign In `client_secret` JWT from env vars only. Used by `.eas/workflows/rotate-apple-jwt.yml` every 90 days.                                                                                                                                                                                                                                     |

Anything else (preflight checks, env validation, version bumps) is in the `vexpo` CLI or in `eas-cli` directly.

## Cleaning

```bash
npm run clean              # trash + reinstall
npm run clean:metro        # only Metro/Haste/node-compile-cache
npm run clean:state        # also remove .setup-state.json
```

Or call it directly with `node scripts/clean.mjs --metro`.

## Setup

Use the `vexpo` CLI.

```bash
npx vexpo lite               # sets up Convex and Better Auth
npx vexpo full               # adds Resend, Apple Sign In, the ASC key, eas init, and rebrand
```

These run on their own.

```bash
npx vexpo doctor             # checks every credential against the live service
npx vexpo env push           # sync from .env.local + .env.prod to Convex and EAS
npx vexpo apple asc-key      # validate ASC API key
npx vexpo apple services-id  # attach SIWA capability to App ID
npx vexpo apple jwt          # sign client_secret JWT, push to Convex
```

The CLI is [`@ramonclaudio/vexpo` on npm](https://www.npmjs.com/package/@ramonclaudio/vexpo). The source is at [`github.com/ramonclaudio/vexpo`](https://github.com/ramonclaudio/vexpo).
