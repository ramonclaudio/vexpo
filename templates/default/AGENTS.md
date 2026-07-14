# AGENTS

Conventions for AI coding assistants and humans working in a scaffolded vexpo
project.

## Fresh-scaffold setup

If this project still carries template identity (`app.config.ts` says
`Vexpo`), set it up before writing any feature code. Collect these from the
human first: app display name, iOS bundle id, their full name, Expo account
slug, App Review contact email, and marketing, support, and privacy URLs.

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
  for leftover template branding. The command owns both. Remaining `vexpo`
  mentions are references to the CLI and belong there. To change identity
  later, re-run with `--force`.
- Then `npx vexpo lite` provisions the dev backend (Convex + Better Auth). If
  it needs a Convex login, hand that command to the human. On an EAS-managed
  Convex team, project creation fails with `is managed by oauth:...`: run
  `npx eas-cli integrations:convex:connect` then `npx vexpo adopt` instead,
  adopt derives the deployment from the key the integration writes. The
  TestFlight road is the Ship path playbook below.
- Verify with `npm run typecheck && npm run lint && npm run format:check &&
npm run test`, then commit the setup as one commit.
- Done means the gate is green and the human runs `npm run convex:dev` and
  `npm run ios` in two terminals.

## Ship path (agent playbook)

The road to TestFlight, with the human/agent split made explicit. Every step
is resumable (`vexpo full` picks up from state), so re-run freely after any
handoff. Steps marked HUMAN structurally need them. Run everything else
yourself.

0. Confirm the accounts exist before starting, and ask the human about any
   you can't verify: an Expo account (EAS), an Apple Developer Program
   membership (paid, includes App Store Connect), a Convex account (already
   there if `vexpo lite` ran), and for email a Resend account plus a
   DNS-verified sending domain. `vexpo full --new` walks any missing signup,
   and the Prerequisites section at the top of every `vexpo full` run reports
   both CLI login states.
1. HUMAN, once per machine: `npx eas-cli login` (and `npx convex login` if
   Prerequisites flags it). Hand these over as `! npx eas-cli login` so they
   run in-session.
2. HUMAN, once ever: download the ASC API key `.p8` (Team key, App Manager
   role) from App Store Connect into `credentials/`. Apple shows the download
   exactly once. The README's App Store submission section has the walk.
3. AGENT: `npx vexpo full`. Two prompts inside it need the human: the Resend
   **Full access** key paste (the key must be created fresh and left untouched
   until the run reports done, editing its permission in the dashboard rotates
   the token), and any Apple portal step the CLI prints a manual walk for
   (Services ID creation). Never handle the raw key value yourself, hand
   `! npx vexpo resend` to the human or have them export
   `RESEND_FULL_ACCESS_KEY` for the run.
4. AGENT: `npm run updates:gen-cert -- --name "<org>"`, then upload the
   private key as the `EAS_UPDATE_PRIVATE_KEY` file secret (the script prints
   the command). Dev serving keeps working, `scripts/dev.mjs` passes the
   signing key to Metro automatically.
5. HUMAN, the one interactive build: `! npm run eas:tf` (credentials wizard +
   build + TestFlight submit in one run). Coach the answers: reuse the
   existing distribution certificate (Apple caps a team at 3), let it mint a
   fresh provisioning profile, reuse the existing push key (capped at 2), and
   let it generate an EAS-managed submit key. Two live ASC keys is the
   designed end state (local `credentials/` key for `eas.json`/CLI submits,
   EAS-managed for cloud auto-submits), don't try to collapse them. Monitor
   the build once it's rolling.
6. AGENT, everything after the first build is headless: `npx vexpo asc
connect` to finish the EAS↔ASC link (at its key picker, a stale stored key
   401s, the create-or-upload entry is the escape), then `npx vexpo
testflight groups create` / `invite` / `whats-new`, `npx vexpo submit` for
   re-submits, and `npx vexpo doctor --strict` as the closing gate. Don't run
   `metadata:push` until real store copy exists, it writes the live App Store
   listing.
7. HUMAN, the listing's manual half: the ASC dashboard settings no API
   covers (privacy nutrition labels, pricing, content rights, age rating,
   accessibility declarations, TestFlight Test Information). Walk
   `app-store/README.md` together, it marks what `metadata:push` re-pushes
   later versus what stays manual, and sync any hand-set `store.config.json`
   field back into the repo.

## Stack at a glance

- Backend. Convex. No raw DB calls. Everything goes through `convex/` (server)
  and `convex/react` (client).
- Auth. Better Auth via `@convex-dev/better-auth@0.12.4`. Email
  verification is gated on the `REQUIRE_EMAIL_VERIFICATION` Convex env var.
- Mobile. Expo SDK 57, RN 0.86, React 19. **iOS only today.**
  Native UI exclusively via `@expo/ui/swift-ui`. No NativeWind, no Tailwind,
  no `react-native-paper`.
- CI/CD. EAS Workflows (`.eas/workflows/*.yml`) for everything
  Expo-shaped. GitHub Actions (`.github/workflows/check.yml`) only for
  general-purpose checks (typecheck, lint, format, tests).

## Conventions

- TypeScript: `strict: true`. Don't add `any` casts. If a type is hard,
  ask before reaching for `any`.
- Imports: Path alias `@/` resolves to the template root. No deep
  relative imports (`../../../`).
- Files: Lowercase, kebab-case filenames. One component per file. Default
  export the component, named exports for everything else.
- State: Convex `useQuery`/`useMutation` for server state. React `useState`
  for local UI state. No Redux, no Zustand, no Jotai.
- Styling: `@expo/ui/swift-ui` primitives + `modifiers`. `<Host>` marks the
  boundary into native SwiftUI.
- Validation: Zod on the client (`lib/schemas.ts`), Convex validators on
  the server (`convex/validators.ts`). Both, at each boundary.
- Errors: Throw real `Error` instances. Wrap server errors with
  `formatError` from `lib/convex-error.ts`. Don't swallow.
- Tests: Vitest. `__tests__/` covers Convex constants,
  validators, and deep-link parsing. Add tests for new validator logic and
  new HTTP handlers.

## What requires extra care

- Convex functions: every query/mutation needs both server-side
  validators and matching client types. The `convex/_generated/` directory is
  the contract. Run `npx convex codegen` after schema or function changes.
- HTTP routes (`convex/http.ts`): every public endpoint must use
  `convex/webhook.ts` `withWebhook()` factory for HMAC verification + body
  cap + structured logging, or document why it doesn't. Inbound webhooks are
  untrusted by default.
- Apple SIWA JWT: rotates every 90 days via
  `.eas/workflows/rotate-apple-jwt.yml`. Don't break the env-var contract
  that cron depends on (`APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`).
- Push notifications: only work on a physical device. iOS Simulator does
  not deliver APNs.
- `store.config.json`: ships with placeholder values. `npx vexpo rebrand`
  fills in the identity and review contact. The store copy (subtitle,
  description, keywords) and demo credentials stay yours to write before
  submission. App Review rejects placeholder values.

## When in doubt

- Run `npx vexpo doctor` to check that `.env.local`, Convex env, EAS env,
  and `app.config.ts` agree.
- Use `npx eas <subcommand>` for canonical EAS operations. **Don't reinvent
  EAS.**
- Run `npx vexpo full --plan` for the full setup walkthrough.

## Agent setup

- Claude Code: install Expo's official agent skills with
  `/plugin marketplace add expo/skills` then `/plugin install expo`. For
  Codex, Cursor, or any other agent, run `npx skills add expo/skills`. The
  Convex agent skills install separately via `npx convex ai-files install`.
- Pre-approved commands: `.claude/settings.json` allows read-only
  `git`/`expo`/`eas`/`convex`/`vexpo` calls + the project's `npm run`
  scripts (`typecheck`, `lint`, `test`, `format`, `dev`, `fp`) without
  per-step permission prompts.
- EAS Convex bootstrap: `eas integrations:convex:connect` is the
  upstream SDK 57 path for provisioning a Convex backend, writing
  `CONVEX_DEPLOY_KEY` + `EXPO_PUBLIC_CONVEX_URL`, and registering the env
  vars across Production/Preview/Development. `npx vexpo full` is the
  broader path that also wires Better Auth, Resend, and App Store identity
  in one shot. Use vexpo for a complete starter, EAS for Convex alone.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
