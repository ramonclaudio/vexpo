# AGENTS

These are the conventions for AI coding assistants (and humans) working in a
scaffolded vexpo project.

## Fresh-scaffold setup

If this project still carries template identity (`app.config.ts` says
`Vexpo`), set it up before writing any feature code. Collect the app display
name, iOS bundle id, their full name, Expo account slug, App Review contact
email, and the marketing, support, and privacy URLs from the human first.

```bash
npx vexpo rebrand -y \
  --app-name "<name>" --bundle-id <com.owner.app> \
  --owner-name "<full name>" --expo-owner <slug> \
  --review-email <email> --marketing-url <url> \
  --support-url <url> --privacy-url <url>
```

- Fully flagged with `-y` it runs without a TTY. It derives the slug, scheme,
  and copyright, rewrites every branded file (`app.config.ts`, `app.json`,
  `package.json` + lockfile, `store.config.json`, `convex/env.ts`,
  `.env.example`, `README.md`), and formats what it touches.
- Don't hand-edit identity into files afterward, and don't sweep the codebase
  for leftover template branding. `rebrand` handles both. Remaining `vexpo`
  mentions are references to the CLI and belong there. To change identity
  later, re-run with `--force`.
- Then `npx vexpo lite` provisions the dev backend (Convex + Better Auth). If
  it needs a Convex login, hand that command to the human. On an EAS-managed
  Convex team, project creation fails with `is managed by oauth:...`. Run
  `npx eas-cli integrations:convex:connect` then `npx vexpo adopt` instead.
  Adopt derives the deployment from the key the integration writes. The Ship
  path playbook picks up from there.
- Verify with `npm run typecheck && npm run lint && npm run format:check &&
npm run test`, then commit the setup as one commit.
- Done means the gate is green and the human runs `npm run convex:dev` and
  `npm run ios` in two terminals.

## Ship path (agent playbook)

These are the steps to TestFlight, with the human's work and the agent's kept
separate. Every step is resumable (`vexpo full` picks up from state), so
re-running after a handoff is safe. A step marked HUMAN needs the human, and
you run everything else yourself.

0. Confirm the accounts exist before starting, and ask the human about any
   you can't verify. You need an Expo account (EAS) and a paid Apple
   Developer Program membership, which includes App Store Connect. You also
   need a Convex account, already there if `vexpo lite` ran, and for email
   a Resend account plus a DNS-verified sending domain. `vexpo full --new`
   walks any missing signup, and the Prerequisites section at the top of
   every `vexpo full` run reports both CLI login states.
1. HUMAN, once per machine: `npx eas-cli login` (and `npx convex login` if
   Prerequisites flags it). Hand these over as `! npx eas-cli login` so they
   run in-session.
2. HUMAN, once ever: download the ASC API key `.p8` (Team key, App Manager
   role) from App Store Connect into `credentials/`. Apple shows the download
   exactly once. The README's App Store submission section has the steps.
3. AGENT: `npx vexpo full`. Two prompts inside it need the human. One is the
   Resend **Full access** key paste. Create that key fresh and leave it alone
   until the run reports done, because editing its permission in the dashboard
   rotates the token. The other is any Apple portal step the CLI prints a
   manual walkthrough for (Services ID creation). Never handle the raw key
   value yourself, hand `! npx vexpo resend` to the human or have them export
   `RESEND_FULL_ACCESS_KEY` for the run.
4. AGENT: `npm run updates:gen-cert -- --name "<org>"`, then upload the
   private key as the `EAS_UPDATE_PRIVATE_KEY` file secret (the script prints
   the command). Dev serving keeps working, `scripts/dev.mjs` passes the
   signing key to Metro automatically.
5. HUMAN, the one interactive build: `! npm run eas:tf` (credentials wizard +
   build + TestFlight submit in one run). Coach the answers. Reuse the
   existing distribution certificate (Apple caps a team at 3), let it create a
   fresh provisioning profile, reuse the existing push key (capped at 2), and
   let it generate an EAS-managed submit key. Two live ASC keys is the end
   state. The local `credentials/` key covers `eas.json` and CLI
   submits, and the EAS-managed one covers cloud auto-submits. Don't try to
   collapse them. Monitor the build once it's rolling.
6. AGENT, everything after the first build is headless. Run `npx vexpo asc
connect` to finish the EAS↔ASC link. At its key picker a stale stored key
   401s, and the create-or-upload entry is the way out. Then `npx vexpo
testflight groups create`, `invite`, and `whats-new`, `npx vexpo submit`
   for re-submits, and `npx vexpo doctor --strict` as the closing gate.
   Don't run `metadata:push` until real store copy exists, it writes the
   live App Store listing.
7. HUMAN, the listing's manual half: the ASC dashboard settings no API
   covers (privacy nutrition labels, pricing, content rights, age rating,
   accessibility declarations, TestFlight Test Information). Walk
   `app-store/README.md` together. It marks what `metadata:push` re-pushes
   later and what stays manual. Sync any hand-set `store.config.json` field
   back into `store.config.example.json`, which is the tracked half.

## Stack at a glance

- Backend: Convex, with no raw DB calls. Everything goes through `convex/`
  (server) and `convex/react` (client).
- Auth: Better Auth via `@convex-dev/better-auth@0.12.5`, with email
  verification gated on the `REQUIRE_EMAIL_VERIFICATION` Convex env var.
- Mobile: Expo SDK 57, React Native 0.86, and React 19, **iOS only today**,
  with native UI exclusively through `@expo/ui/swift-ui`.
- CI/CD: EAS Workflows (`.eas/workflows/*.yml`) for everything Expo-shaped,
  and GitHub Actions (`.github/workflows/check.yml`) only for
  general-purpose checks (typecheck, lint, format, tests).

## Conventions

- TypeScript: `strict: true`. Don't add `any` casts. If a type is hard,
  ask before reaching for `any`.
- Imports: Path alias `@/` resolves to the template root. No deep
  relative imports (`../../../`).
- Files: lowercase kebab-case names, one component per file. Default-export
  the component and name-export everything else.
- State: Convex `useQuery` and `useMutation` for server state, React
  `useState` for local UI state. No Redux, no Zustand, no Jotai.
- Styling: `@expo/ui/swift-ui` primitives + `modifiers`. `<Host>` marks where
  native SwiftUI starts.
- Validation: Zod on the client (`lib/schemas.ts`) and Convex validators on
  the server (`convex/validators.ts`), both at each boundary.
- Errors: Throw real `Error` instances. Wrap server errors with
  `formatError` from `lib/convex-error.ts`. Don't swallow.
- Tests: Vitest, with `__tests__/` covering Convex constants, validators,
  and deep-link parsing. Add tests for new validator logic and new HTTP
  handlers.

## What requires extra care

- Convex functions: every query or mutation needs both server-side
  validators and matching client types. The `convex/_generated/` directory is
  the contract. Run `npx convex codegen` after schema or function changes.
- HTTP routes (`convex/http.ts`): every public endpoint must use the
  `withWebhook()` factory from `convex/webhook.ts` for HMAC verification +
  body cap + structured logging, or document why it doesn't. Inbound webhooks are
  untrusted by default.
- Sign in with Apple JWT: rotates every 90 days via
  `.eas/workflows/rotate-apple-jwt.yml`. Don't break the env-var contract
  that cron depends on (`APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`).
- Push notifications: only work on a physical device. iOS Simulator does
  not deliver APNs.
- `store.config.json`: starts as a copy of the tracked
  `store.config.example.json` and is itself gitignored, because
  `vexpo review-account` writes a generated App Review demo password into it.
  `npx vexpo rebrand` fills in the identity and review contact. The store copy
  (subtitle, description, keywords) and the demo credentials stay yours to
  write before submission. App Review rejects placeholder values. Put copy you
  want versioned in the example too. That's what a fresh clone restores from.

## When in doubt

- Run `npx vexpo doctor` to check that `.env.local`, Convex env, EAS env,
  and `app.config.ts` agree.
- Use `npx eas-cli <subcommand>` for EAS operations, never bare `npx eas`,
  which can't resolve the binary. Don't rebuild what EAS already does.
- Run `npx vexpo full --plan` for the full setup walkthrough.

## Agent setup

- Claude Code: install Expo's official agent skills with
  `/plugin marketplace add expo/skills` then `/plugin install expo`. For
  Codex, Cursor, or any other agent, run `npx skills add expo/skills`. The
  Convex agent skills install separately via `npx convex ai-files install`.
- Pre-approved commands: `.claude/settings.json` allows read-only
  `git`, `expo`, `eas`, `convex`, and `vexpo` calls plus the project's
  `npm run` scripts (`typecheck`, `lint`, `test`, `format`, `dev`, `fp`)
  without per-step permission prompts.
- EAS Convex bootstrap: `eas integrations:convex:connect` is the
  upstream SDK 57 path for provisioning a Convex backend, writing
  `CONVEX_DEPLOY_KEY` + `EXPO_PUBLIC_CONVEX_URL`, and registering the env
  vars across Production/Preview/Development. `npx vexpo full` also wires
  Better Auth, Resend, and App Store identity. Use vexpo for the rest of the
  setup, EAS for Convex alone.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
