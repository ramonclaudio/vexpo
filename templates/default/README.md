# vexpo

## Quick start

```bash
npm install

npx vexpo lite         # sets up Convex and Better Auth
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have an account
```

Then run the backend and the app in two terminals.

```bash
npx convex dev          # terminal 1
npm run ios             # terminal 2
```

`npm run ios -- --device` builds onto a plugged-in iPhone instead of the simulator.

The sign-in, verification and password reset emails carry a link that opens the app on the right screen with the code filled in. Try a link on the simulator with `npx uri-scheme open "vexpodev://linked?from=cli" --ios`.

`lite` skips Apple, EAS and Resend, so sign-up auto-verifies and you're in the app right away. The flows that need Resend (OTP, password reset, change email) are hidden until you set it up. Run `npx vexpo rebrand` when you want the app to be yours instead of Vexpo.

Convex is the only account you need to get this far. Expo, Apple and Resend come in when you ship.

## License

MIT
