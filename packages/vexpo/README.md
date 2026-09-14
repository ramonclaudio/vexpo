# vexpo

The CLI for a vexpo app. Run it inside the project. You need macOS and Xcode, the template is iOS only.

## Setup

```text
vexpo lite                        sets up Convex and Better Auth
vexpo lite --new                  same, plus a Convex signup walkthrough
vexpo full                        adds Resend, Sign in with Apple, the App Store Connect key, EAS and the rebrand
vexpo full --new                  same, plus signups for Apple, Convex, Expo and Resend
vexpo full --skip-rebrand         full setup without the rebrand wizard

vexpo doctor                      checks every credential against the live service
vexpo doctor --json               JSON output
vexpo doctor --strict             fail on warnings

vexpo accounts                    sign up for Apple, Expo, Convex and Resend
vexpo rebrand                     replace the template defaults with yours
vexpo review-account              create the App Review demo account on Convex
vexpo convex                      create or connect a Convex deployment
vexpo convex --eas                connect through the EAS integration instead of `convex dev`
vexpo convex migrate              copy the server-side env from another deployment
vexpo better-auth                 set SITE_URL, BETTER_AUTH_SECRET and APP_NAME on Convex
vexpo resend                      create the Resend sending key and webhook
vexpo env push                    push .env.local and .env.prod to Convex and EAS
vexpo adopt                       finish a project created by `eas integrations:convex:connect`
vexpo asc connect                 link the EAS project to its App Store Connect app
```

## Apple

```text
vexpo apple asc-key               validate an App Store Connect API key and cache it
vexpo apple credentials           run `eas credentials:configure-build` with the cached key
vexpo apple services-id           find the Sign in with Apple Services ID and turn the capability on
vexpo apple jwt                   sign the Sign in with Apple client secret (good for 180 days)
vexpo apple jwt --rotate          sign a new one
```

## App Store Connect

```text
vexpo testflight groups list                 list beta groups
vexpo testflight groups create <name>        create a beta group
vexpo testflight groups view <id>            view a beta group and its testers
vexpo testflight groups delete <id>          delete a beta group
vexpo testflight testers list                list beta testers
vexpo testflight invite <email>              add a tester and send a TestFlight invite
vexpo testflight whats-new <buildId> <text>  set the "What's new" notes on a build already up
vexpo testflight feedback                    recent tester screenshot feedback, newest first
vexpo testflight crashes                     recent tester crash reports, newest first

vexpo submit                                 submit the latest build to TestFlight, no prompts
vexpo submit --id <buildId>                  submit a specific build
vexpo submit --profile <name>                pick an eas.json submit profile
vexpo submit --what-to-test <text>           set the TestFlight "What to test" notes as it submits

vexpo asc privacy show [file]                show privacy.config.json
vexpo asc privacy lint <file>                check privacy.config.json against Apple's enums
vexpo asc accessibility show                 fetch the app's accessibility declarations and URL
vexpo asc accessibility lint <file>          check accessibility.config.json against Apple's schema
vexpo asc accessibility push <file>          send accessibility.config.json to App Store Connect (--dry-run, --publish)
```

## License

MIT
