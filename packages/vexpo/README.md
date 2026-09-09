# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![Check](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml/badge.svg)](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The setup CLI for [vexpo](https://github.com/ramonclaudio/vexpo) projects. A vexpo project is an iOS app built on Expo SDK 57 with `@expo/ui`'s fully native SwiftUI, Convex set up as the backend, Better Auth wired in for authentication, and Resend for email.

[`create-vexpo`](https://www.npmjs.com/package/@ramonclaudio/create-vexpo) puts it in your devDependencies, so you run it with `npx vexpo`.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-doctor.gif" width="720" alt="vexpo doctor auth-checking every credential against the live services">
</p>

## Setup

Run these inside a scaffolded vexpo project. You need macOS and Xcode, since the template is iOS only.

```text
vexpo lite                        sets up Convex and Better Auth
vexpo lite --new                  same, plus a Convex signup walkthrough if you don't have an account
vexpo full                        adds Resend, Apple Sign In, the ASC key, eas init, and rebrand
vexpo full --new                  same, plus helps you sign up for Apple, Convex, Expo, and Resend
vexpo full --skip-rebrand         full setup, skip the rebrand wizard

vexpo doctor                      checks every credential against the live service
vexpo doctor --json               machine-readable output
vexpo doctor --strict             exit non-zero on any warn

vexpo accounts                    sign up for Apple, Expo, Convex, and Resend (standalone)
vexpo rebrand                     replace template defaults with your identity
vexpo review-account              create the App Review demo account on Convex
vexpo convex                      create or connect a Convex deployment
vexpo convex --eas                connect through the EAS integration instead of `convex dev`
vexpo better-auth                 set SITE_URL, BETTER_AUTH_SECRET, APP_NAME on Convex
vexpo resend                      create the Resend sending key + webhook, write to Convex env
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
vexpo testflight whats-new <buildId> <text>  set the "What's new" notes on a build already up
                                             (at submit time use `eas submit --what-to-test`)
vexpo testflight feedback                    recent tester screenshot feedback, newest first
vexpo testflight crashes                     recent tester crash reports, newest first

vexpo submit                                 submit the latest build to TestFlight, no prompts
vexpo submit --id <buildId>                  submit a specific build
vexpo submit --profile <name>                pick an eas.json submit profile

vexpo asc privacy show [file]                show the declared privacy.config.json
vexpo asc privacy lint <file>                validate privacy.config.json against Apple's enums
vexpo asc accessibility show                 fetch the app's accessibility declarations
vexpo asc accessibility lint <file>          validate accessibility.config.json against Apple's AccessibilityDeclaration
vexpo asc accessibility push <file>          send accessibility.config.json to App Store Connect (--dry-run, --publish)
vexpo asc accessibility url [url]            show or set the accessibility URL on the App Store page (--clear)
```

## What vexpo doesn't do

vexpo only does what `eas-cli` doesn't. That is the setup steps, checking credentials against the live services, the Sign in with Apple (SIWA) work, and App Store Connect setup. For anything else, run `eas` directly.

`vexpo full` runs `eas init`, `eas env:push`, `eas credentials` and the ASC link for you, using the cached ASC key. Two of those also run on their own. `vexpo asc connect` does the link, and `vexpo submit` runs `eas submit` with no prompts, using your validated key instead of whatever EAS has stored.

## Repository

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)

If you want to work on the CLI itself, [CONTRIBUTING.md](https://github.com/ramonclaudio/vexpo/blob/main/CONTRIBUTING.md) has what you need.

## License

MIT
