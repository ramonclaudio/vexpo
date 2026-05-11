# scripts

Build and maintenance scripts. Setup orchestration lives in the published `vexpo` CLI (run via `bunx vexpo`), not here.

## What's in this directory

| Script                 | What it does                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `clean.ts`             | Trash + reinstall. `--metro` for cache-only nuke (Metro/Babel/Haste). `--state` also wipes `.setup-state.json`.                 |
| `rotate-apple-jwt.mjs` | Re-signs the Apple Sign In `client_secret` JWT from env vars only. Used by `.eas/workflows/rotate-apple-jwt.yml` every 90 days. |
| `_run.mjs`             | Runtime selector for `clean.ts`. Picks `bun` if available, falls back to `tsx`. Not used by the CLI.                            |

Anything else (preflight checks, env validation, version bumps) lives in the `vexpo` CLI or in `eas-cli` directly.

## Setup orchestration

Use the `vexpo` CLI:

```bash
bunx vexpo lite               # dev-mode setup (Convex + Better Auth only)
bunx vexpo full               # full provisioning to TestFlight-ready
bunx vexpo doctor             # cross-source drift detection
bunx vexpo env push           # sync from .env.local + .env.prod to Convex/EAS
bunx vexpo apple asc-key      # validate ASC API key
bunx vexpo apple services-id  # attach SIWA capability to App ID
bunx vexpo apple jwt          # sign client_secret JWT, push to Convex
```

Version bumps run through `eas build:version:set` / `eas build:version:sync` (`appVersionSource: "remote"` in `eas.json` puts EAS in charge of the version).

The CLI itself ships from [`vexpo` on npm](https://www.npmjs.com/package/vexpo). Source lives at [`github.com/ramonclaudio/vexpo`](https://github.com/ramonclaudio/vexpo).

## Conventions

- All deletions go through `trash`. Recoverable from macOS Trash.
- Scripts here are intentionally minimal. The heavy logic is in the CLI.
