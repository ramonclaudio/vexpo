# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![Check](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml/badge.svg)](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The setup CLI for [vexpo](https://github.com/ramonclaudio/vexpo) projects (Expo + Convex + Better Auth + Resend, iOS).

Scaffolded by [`create-vexpo`](https://www.npmjs.com/package/@ramonclaudio/create-vexpo) into your devDependencies. Run it with `npx vexpo`.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-doctor.gif" width="720" alt="vexpo doctor auth-checking every credential against the live services">
</p>

## Setup

Run these inside a scaffolded vexpo project (macOS and Xcode, iOS-only):

```text
vexpo lite                        Convex + Better Auth only, provisioned in ~60s
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
vexpo eas                         EAS bootstrap: link project, ensure channels + branches, push env
vexpo eas --with-prod             same + push .env.prod EXPO_PUBLIC_* vars to production + preview
vexpo env push                    push .env.local + .env.prod to Convex + EAS env
vexpo env convex-key              sync Convex deploy key + selector to EAS (post-migration fix)
vexpo adopt                       finish a project created by `eas integrations:convex:connect`
vexpo convex migrate              copy server-side Convex env from another deployment
vexpo asc connect                 link the EAS project to its ASC app (wraps `eas integrations:asc:connect`)
```

## Apple

```text
vexpo apple asc-key               validate an ASC API key against /v1/apps
vexpo apple asc-key --revalidate  re-check the cached key without re-prompting
vexpo apple credentials           wrap `eas credentials:configure-build` with the cached ASC key
vexpo apple services-id           detect SIWA Services ID + attach APPLE_ID_AUTH capability
vexpo apple jwt                   sign the SIWA ES256 client_secret JWT (180-day expiry)
vexpo apple jwt --rotate          re-sign the JWT only
vexpo apple eas-rotation-secrets  push the 5 EAS production secrets the JWT cron needs
```

## App Store Connect

```text
vexpo testflight groups list                 list beta groups
vexpo testflight groups create <name>        create a beta group
vexpo testflight groups view <id>            view a beta group + its testers
vexpo testflight groups delete <id>          delete a beta group
vexpo testflight testers list                list beta testers
vexpo testflight invite <email>              add a tester + send a TestFlight invite
vexpo testflight whats-new <buildId> <text>  set the "What's new" notes

vexpo asc privacy show [file]                show the declared privacy.config.json
vexpo asc privacy lint <file>                validate privacy.config.json against Apple's enums
vexpo asc accessibility show                 fetch the app's accessibility declarations
vexpo asc accessibility lint <file>          validate accessibility.config.json against Apple's enums
```

## Don't reinvent EAS

vexpo only covers what `eas-cli` doesn't: setup orchestration, cross-source drift detection, Apple SIWA work, and App Store Connect setup. For the canonical platform surface, reach for `eas` directly.

`vexpo full` drives `eas init`, `eas env:push`, `eas credentials`, and the ASC link internally using the cached ASC key. Only the ASC link is also standalone, as `vexpo asc connect`.

## Repo

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)

Working on the CLI itself? See [CONTRIBUTING.md](https://github.com/ramonclaudio/vexpo/blob/main/CONTRIBUTING.md).

## License

MIT
