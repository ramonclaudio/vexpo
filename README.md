# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo?label=create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo?label=vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Expo and EAS already take an iOS app from code to the App Store. vexpo is everything around that: an Expo SDK 56 scaffold with Convex, Better Auth, and Resend wired in for backend, auth, and email, plus a CLI that automates the setup EAS needs (Apple Developer, App Store Connect, Sign in with Apple, env sync across dev, preview, and prod) to get you from an empty directory to TestFlight.

```bash
npm create @ramonclaudio/vexpo@latest my-app
cd my-app

npx vexpo lite          # Convex + Better Auth, simulator-ready in about a minute
```

Then run it in two terminals:

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

`lite` skips Apple, EAS, and Resend, so sign-up auto-verifies and you land in the app with one tap. When you're ready to ship, swap `lite` for `full`:

```bash
npx vexpo full          # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo doctor        # auth-checks every credential against the real service
```

`full` writes the env, sets Convex vars, signs the Apple Sign In JWT, runs `eas init` and `eas env:push`, then prints the `eas build` command. The build itself is yours to run. That's EAS territory. `doctor` hits Resend, the ASC API, and decodes the Apple JWT, then cross-references bundle ID, team ID, and Services ID across every config. What `lite` and `full` do at each step lives in [`templates/default/SETUP.md`](./templates/default/SETUP.md). Add `--new` to either for the first-time signup walkthroughs.

Two packages back this: [`create-vexpo`](https://www.npmjs.com/package/@ramonclaudio/create-vexpo) scaffolds the app, [`vexpo`](https://www.npmjs.com/package/@ramonclaudio/vexpo) is the CLI that provisions, verifies, and repairs the setup.

## What's in the box

Expo SDK 56, RN 0.85, React 19. Strict TypeScript, no NativeWind. Every screen renders SwiftUI through `@expo/ui/swift-ui`, with Liquid Glass on iOS 26+ and a blur fallback below. Email, password, and OTP auth plus Apple Sign In with session revocation, App Attest, and soft-delete. APNs push, Apple Universal Links, and Resend webhooks. EAS handles builds, OTA updates, submission, and metadata, with ten workflows under `.eas/workflows/`. None trigger on a push to `main`, so a merge can't ship to the App Store by surprise.

Some of the SwiftUI modifiers the template reaches for ship via upstream PRs I wrote and got merged into `expo/expo`. The screen-by-screen breakdown lives in [`templates/default/README.md`](./templates/default/README.md), the design rationale in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Repo layout

```
vexpo/
├── packages/
│   ├── create-vexpo/      # npm scaffolder (`npm create @ramonclaudio/vexpo@latest`)
│   └── vexpo/             # operational CLI (`npx vexpo <subcommand>`)
├── templates/default/     # the Expo + Convex + Better Auth app
└── docs/                  # ARCHITECTURE, SECURITY, OPERATIONS, UPSTREAM
```

`create-vexpo` copies `templates/default/` into a fresh directory, rewrites `package.json`, runs `npm install`, inits git. `vexpo` ships as a devDependency, so `npx vexpo` resolves to the local pinned version.

## Pre-reqs

- macOS and Xcode for the simulator and signing
- Bun or Node 20+
- Apple Developer Program membership ($99/yr) when you're ready to ship
- A domain you control DNS for (Resend sending domain)

## Docs

- [`templates/default/README.md`](./templates/default/README.md): the app itself, screen by screen.
- [`templates/default/SETUP.md`](./templates/default/SETUP.md): every setup phase, prompts, env-var alternatives, recovery paths.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): why Convex, why Better Auth, the EAS wiring, the setup state machine.
- [`docs/SECURITY.md`](./docs/SECURITY.md): threat model, webhook verification, OTA code-signing, the secret-rotation matrix.
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md): service map, daily checks, failure modes with recovery steps.
- [`docs/UPSTREAM.md`](./docs/UPSTREAM.md): ledger of every `expo/expo` PR I wrote that the template depends on.
- [`templates/default/DESIGN.md`](./templates/default/DESIGN.md): palette, typography, spacing, the SwiftUI primitives.

Working on vexpo itself? See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT
