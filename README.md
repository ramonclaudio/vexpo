# vexpo

## Quick start

```bash
npm create @ramonclaudio/vexpo@latest my-app
cd my-app

npx vexpo lite          # sets up Convex and Better Auth
npx vexpo lite --new    # same, plus a Convex signup walkthrough if you don't have an account
```

Then run the backend and the app in two terminals.

```bash
npx convex dev          # terminal 1
npm run ios             # terminal 2
```

`lite` skips Apple, EAS and Resend, so sign-up auto-verifies and you're in the app right away. The app is still called Vexpo at this point. `npx vexpo rebrand` replaces the name, bundle id and everything else with yours, and `full` runs that for you so you don't have to remember.

When you're ready to ship, run `full` and then `doctor` to make sure everything actually connected.

```bash
npx vexpo full          # adds Resend, Sign in with Apple, the App Store Connect key, eas init, and rebrand
npx vexpo doctor        # checks every credential against the live service
```

`full` writes the env, sets the Convex vars, signs the Sign in with Apple secret, runs `eas init` and `eas env:push`, and creates the App Review account. Add `--new` if you still need to sign up somewhere.

A few steps are still yours. You log in to EAS, download the App Store Connect `.p8` once, paste a Resend key, and answer the credentials wizard on the first build. Everything else runs on its own, including every build and submit after that one.

## License

MIT
