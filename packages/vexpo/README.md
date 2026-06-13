# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The setup CLI for [vexpo](https://github.com/ramonclaudio/vexpo) projects (Expo + Convex + Better Auth + Resend, end-to-end iOS). It creates or links your Convex deployment, signs and rotates the Apple keys (the P8 dance), and keeps your env in sync everywhere. It covers the App Store Connect last mile to a first ship. EAS does the heavy lifting (builds, updates, submission), vexpo covers the setup around it.

Scaffolded by [`create-vexpo`](https://www.npmjs.com/package/@ramonclaudio/create-vexpo) into your devDependencies. Run it with `npx vexpo`.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/docs/assets/demo-doctor.gif" width="720" alt="vexpo doctor auth-checking every credential against the live services">
</p>

## Setup

```
vexpo lite                        Convex + Better Auth only, simulator-ready (~60s)
vexpo lite --new                  same + Convex signup walkthrough for first-timers
vexpo full                        full provisioning (Convex + Better Auth + Resend + Apple + EAS init + rebrand)
vexpo full --new                  same + walks Apple/Convex/Expo/Resend signups
vexpo full --skip-rebrand         full setup, skip the rebrand wizard

vexpo doctor                      cross-source drift detection
vexpo doctor --json               machine-readable output
vexpo doctor --strict             exit non-zero on any warn

vexpo accounts                    walk Apple/Expo/Convex/Resend signups (standalone)
vexpo rebrand                     replace template defaults with your identity
vexpo review-account              seed the App Review demo account on Convex
vexpo convex                      provision or connect a Convex deployment
vexpo better-auth                 set SITE_URL, BETTER_AUTH_SECRET, APP_NAME on Convex
vexpo resend                      provision Resend sending key + webhook, write to Convex env
vexpo env push                    push .env.local + .env.prod to Convex + EAS env
vexpo env convex-key              sync Convex deploy key + selector to EAS (post-migration fix)
vexpo adopt                       finish a project created by `eas integrations:convex:connect`
vexpo convex:migrate              copy server-side Convex env from another deployment
vexpo asc:connect                 link the EAS project to its ASC app (wraps `eas integrations:asc:connect`)
```

## Apple

```
vexpo apple asc-key               validate an ASC API key against /v1/apps
vexpo apple asc-key --revalidate  re-check the cached key without re-prompting
vexpo apple credentials           wrap `eas credentials:configure-build` with the cached ASC key
vexpo apple services-id           detect SIWA Services ID + attach APPLE_ID_AUTH capability
vexpo apple jwt                   sign the SIWA ES256 client_secret JWT (180-day expiry)
vexpo apple jwt --rotate          re-sign the JWT only
vexpo apple eas-rotation-secrets  push the 5 EAS production secrets the JWT cron needs
```

## App Store Connect

Picks up after `eas submit` hands a build to TestFlight: groups, testers, release notes, plus the privacy and accessibility labels Apple requires before review.

```
vexpo testflight groups list                 list beta groups
vexpo testflight groups create <name>        create a beta group
vexpo testflight groups view <id>            view a beta group + its testers
vexpo testflight groups delete <id>          delete a beta group
vexpo testflight testers list                list beta testers
vexpo testflight invite <email>              add a tester + send a TestFlight invite
vexpo testflight whats-new <buildId> <text>  set the "What's new" notes

vexpo asc:privacy show [file]                show the declared privacy.config.json
vexpo asc:privacy lint <file>                validate privacy.config.json against Apple's enums
vexpo asc:accessibility show                 fetch the app's accessibility declarations
vexpo asc:accessibility lint <file>          validate accessibility.config.json against Apple's enums
```

## Design rule: don't reinvent EAS

vexpo only covers what `eas-cli` doesn't: setup orchestration, cross-source drift detection, Apple SIWA work, and the last App Store Connect mile to a first ship. If `eas <subcommand>` is the canonical answer, run `npx eas <subcommand>`.

## What `vexpo` doesn't wrap

Reach for `eas` directly for the canonical platform surface.

```bash
npx eas init                     # EAS project init
npx eas build [...]              # builds, list, view, cancel, delete, download, run, resign
npx eas submit
npx eas update [...]             # publish OTAs, --rollout-percentage, etc.
npx eas update:list / update:view / update:edit / update:rollback / update:republish
npx eas channel [...]            # CRUD + rollouts + insights
npx eas branch [...]             # CRUD
npx eas deploy [...]             # EAS Hosting
npx eas webhook [...]            # BUILD/SUBMIT webhook CRUD
npx eas workflow [...]           # run, validate, logs, cancel
npx eas fingerprint [...]
npx eas device [...]             # list, create, view, rename, delete
npx eas metadata [...]
npx eas env [...]                # env:push, env:pull, env:get, env:delete, env:create, env:list
npx eas integrations:asc [...]   # status, connect, disconnect
```

`vexpo full` drives `eas init`, `eas env:push`, `eas credentials`, and the ASC link internally using the cached ASC key. Only the ASC link is also standalone, as `vexpo asc:connect`.

## Architecture

Commander tree in `src/cli.ts`, one file per top-level command in `src/commands/`. `src/lib/eas-cli.ts` shells out to `eas-cli`. Built with tsup to ESM, a `cli.js` entry plus shared chunks. Node 20+.

## Apple ASC API workarounds

Apple changed several ASC API behaviors after the initial CLI release. The CLI handles each one.

- `POST /v1/bundleIds` rejects `platform: "SERVICES"`. `services-id` walks you through manual creation in the developer portal, then re-polls.
- App bundle IDs report `platform: "UNIVERSAL"` for newer accounts. The App ID lookup matches any non-SERVICES platform.
- Relationship endpoints reject `limit`. The capability list fetches without pagination.
- `filter[platform]=SERVICES` returns 400. `doctor` filters by identifier alone.

## Repo

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)

Working on the CLI itself? See [CONTRIBUTING.md](https://github.com/ramonclaudio/vexpo/blob/main/CONTRIBUTING.md).
