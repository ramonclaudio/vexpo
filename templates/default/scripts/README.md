# scripts

Build and maintenance scripts. Setup orchestration lives in the published `vexpo` CLI (run via `npx vexpo`), not here.

## What's in this directory

| Script                 | What it does                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean.ts`             | Trash + reinstall. `--metro` for cache-only nuke (Metro/Haste/node-compile-cache). `--state` also wipes `.setup-state.json`.                                                                                                        |
| `gen-update-cert.mjs`  | One-shot OTA update code-signing setup. Wraps `npx expo-updates codesigning:generate`, writes `certs/certificate.pem` (committed) and `../keys/private-key.pem` (gitignored). Run via `npm run updates:gen-cert -- --name "<Org>"`. |
| `rotate-apple-jwt.mjs` | Re-signs the Apple Sign In `client_secret` JWT from env vars only. Used by `.eas/workflows/rotate-apple-jwt.yml` every 90 days.                                                                                                     |
| `_run.mjs`             | Runtime selector for `clean.ts`. Picks `bun` if available, falls back to `tsx`. Not used by the CLI.                                                                                                                                |

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

Version bumps run through `eas build:version:set` or `eas build:version:sync`. `appVersionSource: "remote"` in `eas.json` puts EAS in charge of the version.

The CLI itself ships from [`@ramonclaudio/vexpo` on npm](https://www.npmjs.com/package/@ramonclaudio/vexpo). Source lives at [`github.com/ramonclaudio/vexpo`](https://github.com/ramonclaudio/vexpo).

