# AGENTS.md

## Project

Monorepo for vexpo, a one-shot Expo + Convex + Better Auth + Resend starter targeting iOS. Three pieces:

- `packages/create-vexpo`: npm scaffolder. Runs as `npm create @ramonclaudio/vexpo@latest my-app`. Copies `templates/default/`, rewrites `package.json` (name, version, `private`, strips publish metadata), installs via the detected package manager (`npm_config_user_agent`, defaults to npm), inits git.
- `packages/vexpo`: operational CLI. Runs as `vexpo <subcommand>` inside a scaffolded project. Scope test for every command: does it help an empty directory reach a first shipped iOS app? Post-launch ops are out of scope.
- `templates/default/`: the Expo SDK 57 + Convex + Better Auth app that gets copied. Standalone (own `package-lock.json`, `node_modules`), not a workspace member because Expo's hoisting doesn't survive npm's workspace install layout.

## Stack rules

### Monorepo (root)

- npm workspace, members `packages/*` only. Single root `package-lock.json`.
- ESM only (`"type": "module"`). Package builds via tsup.

### Template (`templates/default/`)

- EAS Workflows for all CI/CD. PR previews and Maestro E2E ship `workflow_dispatch`-only to conserve build credits. GitHub Actions only for general checks (expo-doctor, typecheck, lint, format, tests).
- Setup is a CLI concern (`npx vexpo lite` or `full`), not a `package.json` script.

### Operational CLI (`packages/vexpo/`)

- Command tree via commander, one file per subcommand under `src/commands/` (apple grouped under `src/commands/apple/`). Each exports `run<Name>(options)` returning an exit code. `cli.ts` handles `process.exit`.
- Cross-cutting helpers under `src/lib/`. Node-only, single ESM bundle.
- Tests in `packages/vexpo/__tests__/`: vitest unit across `lib/` and `commands/`, plus bash e2e in `e2e/run.sh` against the built dist.
- Handles four post-2025 Apple ASC API changes and still works when Apple loosens them: the Services ID can't be created via `POST /v1/bundleIds`, app bundles report `UNIVERSAL`, relationship endpoints reject `limit`, and `filter[platform]=SERVICES` returns 400.

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
- Adding NativeWind, ESLint, Prettier, or Biome to the template. Oxlint + Oxfmt only.
- Adding `@better-auth/stripe`. It pulls SolidJS deps that break Metro. Use `@convex-dev/stripe`.
- Re-introducing `_run.mjs` to the published CLI, or `setup-*.ts` scripts to the template. The CLI is the source of truth.
- Committing `node_modules/`, `dist/`, `.expo/`, `ios/`, `android/`, `.tanstack/`, or other generated artifacts.
- Creating README / CHANGELOG / docs files the user did not ask for.
