# AGENTS.md

Guidance for AI coding agents working in this repository. Complements the README.

## Project

Monorepo for vexpo: a one-shot Expo + Convex + Better Auth + Resend starter targeting iOS. Three pieces:

- `packages/create-vexpo`: npm scaffolder, ~200 lines. Runs as `npm create @ramonclaudio/vexpo@latest my-app`. Copies `templates/default/`, rewrites `package.json` (project name, version, removes monorepo metadata, swaps the `vexpo` workspace ref for the published version), installs dependencies via the detected package manager (sniffed from `npm_config_user_agent`; defaults to `npm`), inits git.
- `packages/vexpo`: operational CLI. Runs as `vexpo <subcommand>` from inside a scaffolded project. Deliberately small: doesn't wrap what `eas` already does well. Surfaces only the things `eas-cli` doesn't do: two-mode setup orchestration (`lite`, `full`) with standalone phases (`accounts`, `rebrand`, `review-account`, `convex`, `better-auth`, `resend`), cross-source drift detection (`doctor`), Apple-side work `eas-cli` doesn't expose (`apple {asc-key, credentials, services-id, jwt, eas-rotation-secrets}`), ASC API endpoints `eas-cli` doesn't expose (`testflight`, `reviews`, `sandbox`, `asc:version`, `asc:submissions`), and multi-destination env sync (`env push`). Commander-based tree, ~400 lines of CLI wiring on top of ~3000 lines of orchestration logic in `src/lib/` and `src/commands/`.
- `templates/default/`: the Expo SDK 56 + Convex + Better Auth app that gets copied. Production-ready: real auth, real push, real OTA, real App Store submission. Standalone (its own `package-lock.json`, `node_modules`), not a workspace member.

npm workspace at the root with `packages/*` as members. Templates intentionally stay outside the workspace because Expo's hoisting expectations don't survive npm's workspace install layout. The `vexpo` CLI links into the template via `npm link` for monorepo dev (`npm run link:dev`).

## Conventions

- **Style**: Small functions (<50 lines). Early returns. No deep nesting. Strict TypeScript. No dead code.
- **Commits**: Conventional commits. `type(scope): lowercase description`, <72 chars, no trailing period. Verbs: add, fix, extract, drop, rename, move, split, wire, swap. Never: implement, leverage, utilize, streamline, enhance.
- **Voice**: Terse, direct, specific. No emdashes. No hedging. No rule-of-three patterns. No marketing copy in commits, PRs, or docs.
- **Destructive ops**: Never `rm`, `rmdir`, `dd`, `find -delete`, `> file` truncation. Use `trash`.
- **Attribution**: Never attribute Claude, Anthropic, Claude Code, or AI in authored content.

## Stack rules

### Monorepo (root)

- npm workspace, members are `packages/*` only. Single `package-lock.json` at the root for those. Template has its own lockfile.
- TypeScript references via per-package `tsconfig.json` extending the root.
- ESM only. `"type": "module"` everywhere.
- Package builds via tsup. No webpack, no rollup directly.
- For monorepo dev, run `npm run link:dev` once. After that, `cd templates/default && npx vexpo lite` (or `full`) resolves through the linked `vexpo` binary.

### Template (`templates/default/`)

- Expo SDK 56 preview. RN 0.85+. React 19.
- Convex backend with reactive queries, storage, real-time sync.
- Better Auth via `@convex-dev/better-auth`.
- Resend via `@convex-dev/resend`. Webhook events including `email.suppressed` for actionable failure tracking.
- Native SwiftUI primitives via `@expo/ui/swift-ui`. Material translucency via `expo-glass-effect` (iOS 26+) + `expo-blur` fallback.
- EAS Workflows for all CI/CD: dev builds, PR previews with `github-comment`, Maestro E2E, deploy-on-push, TestFlight, App Store Connect events, JWT rotation cron.
- GitHub Actions only for general-purpose checks (typecheck, lint, format, tests, fingerprint diff).
- Setup is a one-shot CLI concern (`npx vexpo lite` / `npx vexpo full`), not a `package.json` script. The template only ships runtime scripts (dev, ios, convex:_, eas:_, test, lint, etc.).

### Operational CLI (`packages/vexpo/`)

- Command tree via commander. One file per subcommand under `src/commands/` (apple subcommands grouped under `src/commands/apple/`).
- Each command exports a `run<Name>(options)` function returning a numeric exit code. `cli.ts` handles `process.exit`.
- Cross-cutting helpers (logging, prompts, state cache, proc helpers, lib clients, path expansion) under `src/lib/`.
- Node-only. No `_run.mjs` runtime selector, the published CLI is a single ESM bundle that runs anywhere Node 20+ works.
- Tests live in `packages/vexpo/__tests__/`: 291 vitest unit tests across `lib/` (17 files: app, apple-jwt, asc-accessibility, asc-api, asc-jwt, asc-privacy, convex-env, eas-cli, eas-env, eas-integrations, env-files, env-local, path, pkg-manager, poll, state, verify) and `commands/` (2 files: asc, setup-is-complete), plus 14 bash e2e tests in `e2e/run.sh` against the built dist.

### Apple ASC API workarounds

The CLI handles four post-2025 Apple ASC API changes:

- `POST /v1/bundleIds` rejects `platform: "SERVICES"`. The Services ID has to be created via the developer portal. `apple/services-id.ts` detects missing ones and walks the user through with `helpAndWait`, then re-polls.
- App bundles report `platform: "UNIVERSAL"` for newer accounts. `findOrCreateBundleId` matches any non-SERVICES platform when looking up the App ID.
- Relationship endpoints reject the `limit` query param. `bundleIdCapabilities.list` fetches without pagination.
- `filter[platform]=SERVICES` returns 400. The doctor filters by identifier alone for `services-id-exists`.

When Apple loosens any of these, the CLI continues to work.

## Before making changes

1. Read this file, the template's `AGENTS.md`, and `README.md`.
2. From the root: `npm run typecheck` to confirm packages compile.
3. From the root: `npm run test:all` to run all unit + e2e tests (291 unit + 14 e2e + 34 template = 339).
4. If touching the CLI: `npm run build -w @ramonclaudio/vexpo` then `npm run test:e2e -w @ramonclaudio/vexpo` to confirm the dist behaves.

## Common tasks

- **Build all packages**: `npm run build` from the root.
- **Run the template locally**: `npm run template:dev`.
- **Test the full pipeline**: `npm run test:all` from the root.
- **Test the scaffolder end-to-end**: `npm run build -w @ramonclaudio/create-vexpo && cd /tmp && trash test-app 2>/dev/null. Node /path/to/packages/create-vexpo/dist/index.js test-app --no-install --no-git -y && cd test-app && npm install && npx vexpo full --dry-run`.
- **Add a new vexpo subcommand**: Create `packages/vexpo/src/commands/<name>.ts` exporting `run<Name>(options)`, register in `packages/vexpo/src/cli.ts`, add an e2e test in `__tests__/e2e/run.sh`.
- **Update both lib copies**: There aren't two anymore. The lib lives at `packages/vexpo/src/lib/` and is the only copy. Done.

## Not appropriate

- Adding a backend service / Cloudflare Worker / telemetry endpoint. Static config in the published package is the answer for compatibility matrices and version checks.
- Adding NativeWind, ESLint, Prettier, or Biome to the template. Oxlint + Oxfmt only.
- Adding `@better-auth/stripe`. It pulls SolidJS deps that break Metro. Use `@convex-dev/stripe`.
- Re-introducing `_run.mjs` to the published CLI. Node-only.
- Re-introducing `setup-*.ts` scripts to the template. The CLI is the source of truth.
- Adding `templates/*` to the workspace members array. Expo's hoisting needs the template installed standalone.
- Committing `node_modules/`, `dist/`, `.expo/`, `ios/`, `android/`, `.tanstack/`, or other generated artifacts.
- Creating README / CHANGELOG / docs files the user did not ask for.
