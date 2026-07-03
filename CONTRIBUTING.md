# Contributing

Thanks for wanting to help with vexpo. This guide covers how to report a bug, propose a change, and open a pull request that's quick to review.

vexpo is a small monorepo:

- `packages/vexpo` is the operational CLI you run inside a scaffolded project.
- `packages/create-vexpo` is the `npm create @ramonclaudio/vexpo` scaffolder.
- `templates/default` is the Expo + Convex app it generates.

## Contents

- [Open an issue first](#open-an-issue-first)
- [Reporting a bug](#reporting-a-bug)
- [Proposing a change](#proposing-a-change)
- [Development setup](#development-setup)
- [Checks](#checks)
- [Testing against a real eas build](#testing-against-a-real-eas-build)
- [Code style](#code-style)
- [Tests](#tests)
- [Commits](#commits)
- [Before you open a PR](#before-you-open-a-pr)
- [Security](#security)

## Open an issue first

For anything past a typo, open an issue before you write code. A short issue lets us agree on the approach first, so your time goes toward something that will land. A pull request that isn't tied to an open issue may sit for a while or get a friendly nudge to file one. It saves everyone a round trip.

Security reports are the exception. Please don't open a public issue for those, see [Security](#security).

## Reporting a bug

Open a [bug report](https://github.com/ramonclaudio/vexpo/issues/new?template=bug_report.yml) and tell us:

- what's broken, in a sentence or two
- how to reproduce it, the exact commands in order
- what you expected versus what happened
- your environment. `npx vexpo doctor --redact` covers most of it, and the `--redact` flag masks anything identifying, so it's safe to paste

The more of that you give, the faster it gets fixed.

## Proposing a change

Open a [change proposal](https://github.com/ramonclaudio/vexpo/issues/new?template=feature_request.yml) with the problem you're hitting and the command, flag, or template change you have in mind.

vexpo's scope is 0 to 1: getting an empty directory to a first shipped iOS app. Anything that helps with that is a good fit. Post-launch tooling is welcome but lower priority. The CLI orchestrates `eas` and `convex` rather than re-wrapping what they already do, so a proposal that leans on those tools is an easy yes.

## Development setup

```bash
git clone https://github.com/ramonclaudio/vexpo.git
cd vexpo
npm install          # workspace deps, and wires the pre-push hook
npm run validate     # confirm a clean baseline
npm run link:dev     # build vexpo and link it into templates/default
```

After `link:dev`, `cd templates/default && npx vexpo lite` runs the CLI you just built. `npm run dev -w @ramonclaudio/vexpo` keeps it rebuilding as you edit, and `npx vexpo full --dry-run` exercises the linked CLI without side effects.

## Checks

One command runs the local check suite:

```bash
npm run validate     # format, lint, typecheck, knip, package tests
```

Run it before you push. The pre-push hook runs it for you, and `git push --no-verify` skips it if you need to.

If you touched the template, run its suite too (`npm run template:install` once, then `npm run template:test`). Before you open a PR, run the full end-to-end suite and an audit:

```bash
npm run test:all                 # unit + e2e + template
npm audit --audit-level=high
```

To drive the real Convex Platform API, there's an opt-in e2e suite. It self-skips unless you're logged in and both env vars are set, and it reverses every mutation it makes. Point it at a dev deployment, never prod:

```bash
VEXPO_E2E_CONVEX=1 VEXPO_E2E_DEPLOYMENT=<dev-slug> npm run test:e2e:api -w @ramonclaudio/vexpo
```

CI runs these same checks, so green locally means green on the PR.

## Testing against a real eas build

The committed `templates/default/app.json` is `{ "expo": {} }`, no `projectId`. Forks run `eas init` once and commit their own. To test inside this repo without committing your `projectId`, eas-cli needs it in the process env at invocation time. eas-cli sets `EXPO_NO_DOTENV=1` when it evaluates `app.config.ts` for projectId resolution, which is intentional for build determinism, so `.env.local` alone won't be loaded for that step.

A once-per-session shell export, no tools to install:

```bash
cd templates/default
export $(grep '^EAS_PROJECT_ID=' .env.local)
npx eas-cli build -p ios --profile production --auto-submit-with-profile testflight
```

That holds only for the shell. To auto-load on `cd`, [direnv](https://direnv.net) handles it:

```bash
brew install direnv                                # add `eval "$(direnv hook zsh)"` to your shell rc
echo 'dotenv .env.local' > templates/default/.envrc
direnv allow templates/default
```

`npx vexpo doctor`, `vexpo lite`, `vexpo full`, and `vexpo env push` read `.env.local` directly, so they work without any of this.

## Code style

- Strict TypeScript. No `any`, no `@ts-ignore`.
- The CLI orchestrates `eas` and `convex`. Don't re-wrap what those tools already do.
- Small functions, early returns, no dead code. `npm run knip` keeps the export surface tight.
- Comment only when the why isn't obvious. Let the names carry the what.
- Oxlint and Oxfmt only. No ESLint, Prettier, or Biome.
- No emojis in source, and no AI attribution or `Co-authored-by` trailers in commits or PRs.

Use whatever tools you like to get the code written, AI assistants included. The only thing we ask is that you understand what you're submitting and can walk through it in review. If a tool wrote your commit message or PR description, give it a pass to clean it up and strip any attribution trailers, same as the rule above.

## Tests

Behavior changes and new features land with tests. Refactors keep the coverage they had. For a bug fix, add a test that fails on `main` and passes with your fix. Tests sit next to the code they cover in `__tests__/`.

## Commits

Conventional commits: `type(scope): lowercase summary under 72 chars`, no trailing period. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `test`, `ci`, `build`. One concern per commit. Verbs like `add`, `fix`, `drop`, `rename`, `move`, `wire`.

```
fix(submit): forward .env.local identity to the eas subprocess
feat(apple): add asc connect for the eas to app store link
```

## Before you open a PR

- [ ] It's tied to an open issue. Link it with `Closes #123`.
- [ ] `npm run validate` passes, and `npm run test:all` if you have the deps for it.
- [ ] `npm audit --audit-level=high` is clean.
- [ ] Tests added for any behavior change.
- [ ] `CHANGELOG.md` has an `Unreleased` entry if the change is user-facing.
- [ ] Commits follow the convention, with no attribution trailers.

The pull request template walks you through the rest, including a short test plan of what you ran to verify.

## Security

Please don't open a public issue or pull request for a vulnerability. Report it privately through a [security advisory](https://github.com/ramonclaudio/vexpo/security/advisories/new). See [`SECURITY.md`](SECURITY.md) for the full policy.
