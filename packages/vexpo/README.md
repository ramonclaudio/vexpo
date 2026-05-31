# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Operational CLI for [vexpo](https://github.com/ramonclaudio/vexpo) projects: Expo + Convex + Better Auth + Resend, end-to-end iOS. Provisions the stack, validates every credential, keeps env values in sync across `.env.local` / Convex env / EAS env, and exposes the App Store Connect API endpoints `eas-cli` doesn't.

Scaffolded by [`create-vexpo`](https://www.npmjs.com/package/@ramonclaudio/create-vexpo) into your project's devDependencies. Invoke via `npx vexpo`.

## Design rule: don't reinvent EAS

If `eas <subcommand>` is the canonical answer, the recipe is `npx eas <subcommand>`, not `vexpo`. This CLI only surfaces what `eas-cli` doesn't do: setup orchestration, cross-source drift detection, Apple SIWA work, and the App Store Connect API endpoints that aren't in `eas-cli`. Wrapping every `eas` command would add no value over `eas-cli` itself, expand the maintenance surface, and signal a lack of trust in the platform.

## Setup

```
vexpo lite                        Convex + Better Auth only, simulator-ready (60s)
vexpo lite --new                  same + Convex signup walkthrough for first-time users
vexpo full                        full provisioning (Convex + Better Auth + Resend + Apple + EAS init + rebrand)
vexpo full --new                  same + walks Apple/Convex/Expo/Resend signups
vexpo full --skip-rebrand         full setup, skip the rebrand wizard

vexpo doctor                      Cross-source drift detection
vexpo doctor --json               Machine-readable output
vexpo doctor --strict             Exit non-zero on any warn

vexpo accounts                    Walk Apple/Expo/Convex/Resend signups (standalone)
vexpo rebrand                     Replace template defaults with your identity
vexpo review-account              Seed the App Review demo account on Convex
vexpo convex                      Provision Convex deployment + write .env.local
vexpo better-auth                 Set BETTER_AUTH_SECRET, SITE_URL, APP_NAME on Convex
vexpo resend                      Provision Resend sending key + webhook, flip REQUIRE_EMAIL_VERIFICATION=true
vexpo env push                    .env.local + .env.prod → Convex + EAS (one pass)
```

## Apple

```
vexpo apple asc-key               Validate ASC API key against /v1/apps
vexpo apple credentials           Wraps `eas credentials:configure-build` with cached ASC env vars (skips Apple Developer login prompt)
vexpo apple services-id           Detect SIWA Services ID + attach APPLE_ID_AUTH capability
vexpo apple jwt                   Sign SIWA ES256 client_secret JWT (180-day expiry)
vexpo apple jwt --rotate          Re-sign the JWT only
vexpo apple eas-rotation-secrets  Push the 5 EAS production secrets the JWT cron needs
```

## App Store Connect API (endpoints `eas-cli` doesn't expose)

```
vexpo testflight groups list                 List beta groups
vexpo testflight groups create <name>        Create a beta group
vexpo testflight groups view <id>            View a beta group + its testers
vexpo testflight groups delete <id>          Delete a beta group
vexpo testflight testers list                List beta testers
vexpo testflight invite <email>              Add a tester + send invite
vexpo testflight remove <email>              Remove a tester
vexpo testflight whats-new <buildId> <text>  Set "What's new" notes

vexpo reviews list                           List customer reviews
vexpo reviews unanswered                     Reviews without a response
vexpo reviews respond <reviewId> <body>      Post a response
vexpo reviews delete-response <responseId>   Delete a response

vexpo sandbox list                           List sandbox testers
vexpo sandbox create --email <e> ...         Create a sandbox tester
vexpo sandbox delete <id>                    Delete a sandbox tester

vexpo asc:version list                       List App Store versions
vexpo asc:version view <versionId>           Phased-release state
vexpo asc:version phased <id> <action>       Pause | resume | complete the phased release
vexpo asc:submissions                        List review submissions
```

## What `vexpo` doesn't wrap

For canonical EAS surface, use `eas` directly. Wrapping these would add no value over `eas-cli` itself.

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

`vexpo full` orchestrates `eas init`, `eas env:push`, `eas credentials -p ios` (via `eas credentials:configure-build`), and `eas integrations:asc:connect` internally as setup steps, none are exposed as standalone `vexpo` commands. The ASC API key flows through to both wizards via `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` env vars pre-set from the cached `asc-key` state. These env vars set `AppStoreApi.defaultAuthenticationMode = API_KEY` inside eas-cli, so when the wizard reaches the Apple auth step during ASC key generation, it uses our cached key instead of prompting for Apple ID + password. The manual paste step doesn't auto-fill — the wizard skips it by auto-generating the key instead.

Earlier vexpo versions passed `--api-key-id <apple-key-id>` to `integrations:asc:connect`. That flag matches against EAS's uploaded key resources, not Apple-side identifiers, so it failed with `No App Store Connect API key found with Apple key identifier ...` whenever the key hadn't been uploaded to EAS yet (the common case on fresh projects). The current orchestration drops the flag and relies on the env vars + the wizard's "Create new or use existing" prompt instead.

## Architecture

- Commander-based command tree in `src/cli.ts`.
- One file per top-level command in `src/commands/`. Each exports `run<Name>(options)` returning a numeric exit code.
- `src/lib/eas-cli.ts` is the shared shell-out helper: `easJson<T>(argv)` parses `--json --non-interactive` output, `easSpawn(argv)` forwards stdio for interactive commands, `easText(argv)` returns raw streams.
- Built with tsup → single ESM bundle in `dist/`. Node 20+.

## Apple ASC API workarounds

Apple changed several ASC API behaviors after the initial CLI release. The CLI handles each one:

- `POST /v1/bundleIds` rejects `platform: "SERVICES"`. `services-id` walks the user through manual creation in the developer portal, then re-polls.
- App bundle IDs report `platform: "UNIVERSAL"` for newer accounts. `findOrCreateBundleId` matches any non-SERVICES platform when looking up an App ID.
- Relationship endpoints reject `limit`. `bundleIdCapabilities.list` fetches without pagination.
- `filter[platform]=SERVICES` returns 400. `doctor`'s `services-id-exists` check filters by identifier alone.

## Repo

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)
