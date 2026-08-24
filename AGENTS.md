# AGENTS.md

## Project

This is the monorepo for vexpo, an iOS starter built on Expo with Convex, Better Auth, and Resend. It has three pieces:

- `packages/create-vexpo`: the npm scaffolder, run as `npm create @ramonclaudio/vexpo@latest my-app`. It copies `templates/default/`, rewrites `package.json` (name, version, `private`, stripped publish metadata), installs via the detected package manager (`npm_config_user_agent`, defaulting to npm), and inits git.
- `packages/vexpo`: the CLI, run as `vexpo <subcommand>` inside a scaffolded project. `vexpo lite` provisions Convex and Better Auth, and `vexpo full` adds Resend, Apple Sign In, the App Store Connect key, `eas init`, and rebrand. Post-launch ops are out of scope.
- `templates/default/`: the Expo SDK 57 + Convex + Better Auth app that gets copied. It stands alone with its own `package-lock.json` and `node_modules` instead of joining the workspace, because Expo's hoisting doesn't survive npm's workspace install layout.

## Stack rules

### Monorepo (root)

- An npm workspace whose only members are `packages/*`, with a single root `package-lock.json`.
- ESM only (`"type": "module"`), with packages built via tsup.

### Template (`templates/default/`)

- EAS Workflows for all CI/CD. PR previews and Maestro end-to-end tests are `workflow_dispatch`-only to conserve build credits. GitHub Actions only for general checks (expo-doctor, typecheck, lint, format, tests).
- Setup runs through the CLI (`npx vexpo lite` or `full`), not a `package.json` script.

### CLI (`packages/vexpo/`)

- The command tree runs on commander, one file per subcommand under `src/commands/` (apple grouped under `src/commands/apple/`). Each exports `run<Name>(options)` returning an exit code, and `cli.ts` handles `process.exit`.
- Cross-cutting helpers live under `src/lib/`. The build is Node-only, a single ESM bundle.
- Tests live in `packages/vexpo/__tests__/`, with vitest units across `lib/` and `commands/` plus a bash end-to-end suite in `e2e/run.sh` that runs against the built dist.
- The ASC client handles four post-2025 Apple App Store Connect (ASC) API changes and still works when Apple loosens them. The Services ID can't be created via `POST /v1/bundleIds`, app bundles report `UNIVERSAL`, relationship endpoints reject `limit`, and `filter[platform]=SERVICES` returns 400.

## Before making changes

1. Read this file, the template's `AGENTS.md`, `README.md`, and `CONTRIBUTING.md`.
2. From the root: `npm run typecheck`.
3. From the root: `npm run test:all` (all unit + e2e + template).
4. If touching the CLI: `npm run build -w @ramonclaudio/vexpo` then `npm run test:e2e -w @ramonclaudio/vexpo`.

## Common tasks

- Run the template locally: `npm run template:dev`.
- Add a vexpo subcommand: create `packages/vexpo/src/commands/<name>.ts` exporting `run<Name>(options)`, register in `src/cli.ts`, add an e2e case in `__tests__/e2e/run.sh`.

## Not appropriate

- Adding a backend service, Worker, or telemetry endpoint. Static config in the published package answers compatibility matrices and version checks.
- Adding ESLint, Prettier, or NativeWind to the template. Oxlint and Oxfmt do the linting and formatting, and `@expo/ui` does the styling.
- Adding `@better-auth/stripe`. It pulls SolidJS deps that break Metro. Use `@convex-dev/stripe`.
- Re-introducing `setup-*.ts` scripts to the template. The CLI is the source of truth.
- Writing a template script in TypeScript. `scripts/` is plain `.mjs` so `node <script>` runs it with no runtime selector and no `tsx`.
- Committing `node_modules/`, `dist/`, `.expo/`, `ios/`, `android/`, `.tanstack/`, or other generated artifacts.
- Creating README, CHANGELOG, or docs files the user did not ask for.
