# create-vexpo

## Usage

```bash
npm create @ramonclaudio/vexpo@latest my-app
# or
npx @ramonclaudio/create-vexpo@latest my-app
```

Then set it up.

```bash
cd my-app

npx vexpo lite         # sets up Convex and Better Auth
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have an account
npx vexpo full         # adds Resend, Sign in with Apple, the App Store Connect key, eas init, and rebrand
npx vexpo full --new   # same, plus signups for Apple, Convex, Expo and Resend
```

## Prerequisites

- macOS with Xcode, to build and run the app in the iOS Simulator.
- Bun, or Node 22.12 or newer.
- An Apple Developer membership, but only when you ship to TestFlight or the App Store. You don't need it for local dev with `npx vexpo lite`.

## License

MIT
