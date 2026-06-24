# Contributing

For working on the CLI and the template themselves. If you just want to ship an app, the [`README.md`](./README.md) quick start is all you need.

## Monorepo dev

```bash
npm install                            # package + workspace deps
npm run link:dev                       # build vexpo + npm link it into templates/default
npm run dev -w @ramonclaudio/vexpo     # tsup watch on the CLI source
cd templates/default
npx vexpo full --dry-run               # exercises the linked CLI
```

Tests:

```bash
npm run test               # vexpo unit + template suites
npm run test:packages:e2e  # e2e against the built vexpo dist
npm run test:all           # everything
```

To drive the real Convex Platform API, run the opt-in e2e suite. It self-skips unless you're logged in and both env vars are set, and reverses every mutation it makes.

```bash
VEXPO_E2E_CONVEX=1 VEXPO_E2E_DEPLOYMENT=<dev-slug> npm run test:e2e:api -w @ramonclaudio/vexpo
```

> [!CAUTION]
> Point `VEXPO_E2E_DEPLOYMENT` at a dev deployment slug, never prod.

## Testing `eas build` against `templates/default`

The committed `templates/default/app.json` is `{ "expo": {} }`, no `projectId`. Forks run `eas init` once and commit their own. To test inside this repo without committing your `projectId`, eas-cli needs it in the process env at invocation time. eas-cli sets `EXPO_NO_DOTENV=1` when evaluating `app.config.ts` for projectId resolution, which is intentional for build determinism, so `.env.local` alone won't be loaded for that step.

Once-per-session shell export, no tools to install:

```bash
cd templates/default
export $(grep '^EAS_PROJECT_ID=' .env.local)
npx eas-cli build -p ios --profile production --auto-submit-with-profile testflight
```

The export holds only for that shell. New terminal, re-run it.

To auto-load on `cd`, [direnv](https://direnv.net) handles it:

```bash
brew install direnv                                # add `eval "$(direnv hook zsh)"` to your shell rc
echo 'dotenv .env.local' > templates/default/.envrc
direnv allow templates/default
```

After that, every `cd templates/default` exports `.env.local` for you.

Without either path, the first `eas build` of a fresh checkout prompts "Configure this project?", writes `projectId` into `app.json`, and you stash it before committing.

`npx vexpo doctor`, `vexpo lite`, `vexpo full`, and `vexpo env push` all read `.env.local` directly, so they work without shell-loading.
