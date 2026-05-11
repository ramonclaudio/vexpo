# AGENTS

Guidance for AI coding assistants (Claude Code, Cursor, Aider, etc.) working in
a scaffolded vexpo project. The same content applies to humans reading by
hand. These are conventions, not magic.

## Stack at a glance

- **Backend.** Convex. Reactive queries, real-time sync, storage. No raw DB
  calls. Everything goes through `convex/` (server) and `convex/react`
  (client). After running `npx convex ai-files install`, read
  `convex/_generated/ai/guidelines.md` before touching anything in `convex/`.
- **Auth.** Better Auth via `@convex-dev/better-auth`. Patched locally with
  PR #368 until upstream merges (`patches/`). Email verification is gated on
  the `REQUIRE_EMAIL_VERIFICATION` Convex env var.
- **Mobile.** Expo SDK 56 canary, RN 0.85, React 19. **iOS only today.**
  Native UI exclusively via `@expo/ui/swift-ui`. No NativeWind, no Tailwind,
  no `react-native-paper`.
- **CI/CD.** EAS Workflows (`.eas/workflows/*.yml`) for everything
  Expo-shaped. GitHub Actions (`.github/workflows/check.yml`) only for
  general-purpose checks (typecheck, lint, format, tests, fingerprint).

## Conventions

- **TypeScript:** `strict: true`. Don't add `any` casts. If a type is hard,
  ask before reaching for `any`.
- **Imports:** Path alias `@/` resolves to the template root. No deep
  relative imports (`../../../`).
- **Files:** Lowercase, kebab-case filenames. One component per file. Default
  export the component, named exports for everything else.
- **State:** Convex `useQuery`/`useMutation` for server state. React `useState`
  for local UI state. No Redux, no Zustand, no Jotai.
- **Styling:** `@expo/ui/swift-ui` primitives + `modifiers`. The chassis is
  SwiftUI, not RN. `<Host>` boundary tells you you're crossing into native.
- **Validation:** Zod on the client (`lib/schemas.ts`), Convex validators on
  the server (`convex/validators.ts`). Don't pick one. Both, at each
  boundary.
- **Errors:** Throw real `Error` instances. Wrap server errors with
  `formatError` from `components/ui/convex-error.tsx`. Don't swallow.
- **Tests:** Vitest. `templates/default/__tests__/` covers Convex constants,
  validators, and deep-link parsing. Add tests for new validator logic and
  new HTTP handlers.

## What requires extra care

- **Convex functions**: every query/mutation needs both server-side
  validators and matching client types. The `convex/_generated/` directory is
  the contract. Run `bunx convex codegen` after schema or function changes.
- **HTTP routes** (`convex/http.ts`): every public endpoint must use
  `convex/webhook.ts` `withWebhook()` factory for HMAC verification + body
  cap + structured logging, or document why it doesn't. Inbound webhooks are
  untrusted by default.
- **Apple SIWA JWT**: rotates every 90 days via
  `.eas/workflows/rotate-apple-jwt.yml`. Don't break the env-var contract
  that cron depends on (`APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`).
- **Push notifications**: only work on a physical device. iOS Simulator does
  not deliver APNs. Don't try to test push flows in the simulator.
- **`store.config.json`**: ships with placeholder values. `bunx vexpo
rebrand` fills them in. App Review will reject builds with placeholder
  contact info.

## When in doubt

- Run `bunx vexpo doctor` to check that `.env.local`, Convex env, EAS env,
  and `app.config.ts` agree.
- Use `bunx eas <subcommand>` for canonical EAS operations. **Don't reinvent
  EAS.** That's the vexpo design principle.
- Read `SETUP.md` for the long-form orchestration walkthrough.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
