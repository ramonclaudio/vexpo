# Architecture

vexpo is three pieces that ship together: a scaffolder (`create-vexpo`), an operational CLI (`vexpo`), and a production-wired iOS app (`templates/default`). This doc walks the decisions that shaped each, with the trade-offs that made them the right call.

## Why Convex, not Postgres + Redis + a Node service

The mobile app needs:

- Real-time sync (active sessions, profile edits, push token revocation)
- Auth-aware queries with row-level filtering
- File storage (avatars)
- HTTP routes (AASA, webhooks)
- Cron jobs (rate-limit cleanup, daily aggregates)
- Transactional functions
- Schema with strong typing across client and server

Convex provides all of these as one product. Building the equivalent from scratch (Postgres for state, Redis for cache and pub/sub, an Express/Fastify service for HTTP, a worker for crons, S3 for storage) is two engineers for a quarter. For a one-developer iOS app, the trade is obvious. For a fifty-developer fleet with a Postgres expert, it isn't.

What we give up by choosing Convex:

- The query language is JavaScript, not SQL. No PostgREST-style ad hoc analytics.
- Schema migrations are append-only. Renaming a field is a multi-deploy dance.
- Convex's at-rest storage cost is high vs raw Postgres at scale. We re-evaluate above a million MAU.
- The function execution budget caps a single handler at 1 second (queries and mutations) or 10 minutes (actions). Long jobs go to EAS Workflows.

What we get:

- End-to-end TypeScript with generated query/mutation/action types.
- Real-time WebSocket sync the client subscribes to via `useQuery`, with automatic invalidation on writes.
- HTTP routes (`convex/http.ts`) run on the same infrastructure with no separate service to deploy.
- Built-in observability: per-function timing, error grouping, table-level write rates.

## Why Better Auth via `@convex-dev/better-auth`

Auth has more sharp edges than people remember when they start. Session rotation, account linking, email verification, password reset, magic links, Apple Sign In's Services ID flow, push token registration on sign-in, device-by-device revocation, rate limiting on every credential endpoint. Building these takes weeks. Getting all of them right takes longer.

Better Auth is the smallest auth surface we found that covers the full list, in TypeScript, with adapters for any database. `@convex-dev/better-auth` is the official Convex adapter. It stores Better Auth's tables in a Convex component and exposes Better Auth's HTTP routes through Convex's router.

What we don't use: `@better-auth/stripe` (pulls SolidJS deps that break Metro). For payments use `@convex-dev/stripe` or roll your own webhook handler on top of `convex/webhook.ts`.

## Why EAS top-to-bottom

EAS is Expo's CI/CD-and-infra layer for native apps. vexpo wires every product:

- **EAS Build**: four iOS build profiles (`development`, `development:simulator`, `development:device`, `production`) with `node_modules` and `ios/Pods` cached on the `development` and `production` top-level profiles (simulator and device inherit via `extends`). The `production` profile uses `autoIncrement: true` with `appVersionSource: "remote"` (set globally in `eas.json`'s `cli`) so EAS owns the build number.
- **EAS Update**: `runtimeVersion: { policy: "fingerprint" }` so OTA bundles are automatically tied to native compatibility. Out of the box on SDK 56 the policy fails `CONFIGURE_EXPO_UPDATES` with a `Runtime version calculated on local machine not equal to runtime version calculated during build` error — `expo-modules-autolinking` emits per-package directory hashes for `react-native-reanimated` and `react-native-worklets` (tagged `rncoreAutolinkingIos`) that drift between developer machines and EAS Build's worker even with identical npm lockfile + node version, and `expo-modules-jsi/apple/` drifts from a combination of pod install's `prepare_command` stubs and the autolinker output. Two knobs make it stable in this template: `fingerprint.config.js` sets `useRNCoreAutolinkingFromExpo: false` (switches the autolinker source to `@react-native-community/cli`, consolidating reanimated/worklets into one content-addressed `expoAutolinkingConfig:ios` JSON source), and `.fingerprintignore` excludes `node_modules/expo-modules-jsi/apple/**`. Real native version bumps still flip the fingerprint via package.json + the autolinking JSON, so the safety contract holds. Drop both knobs when upstream fixes the autolinker determinism. `assetPatternsToBeBundled` limits OTA payload to icon + splash. `enableBsdiffPatchSupport: true` because the runtime cost of bsdiff is negligible relative to the bandwidth savings on incremental updates.
- **EAS Submit + Metadata**: `metadataPath: "./store.config.json"` on every submit profile. The template `npm run metadata:push` script chains `eas metadata:lint && eas metadata:push` so shape errors are caught before they reach App Store Connect.
- **EAS Workflows**: ten workflows under `.eas/workflows/`. The pattern that matters: every deploy-style workflow runs `fingerprint` → `get-build` → `build OR update`. Native changes trigger a build, JS changes trigger an OTA. The cost difference is ~15 minutes vs ~30 seconds.
- **EAS Credentials**: managed (`credentialsSource: "remote"`). `vexpo apple credentials` wraps `eas credentials:configure-build` and passes the cached ASC API key via `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` env vars so the wizard skips the Apple Developer login prompt and goes straight to generating the dist cert + provisioning profile + push key.
- **EAS Webhooks**: `BUILD` and `SUBMIT` events post to Convex's `/eas-webhook` (see [`SECURITY.md`](./SECURITY.md) for the signature flow).
- **EAS Insights**: `print_insights` workflow job runs `update:insights --json` post-deploy. `expo-insights` client SDK installed for cold-start + app-store-version breakdowns on the dashboard.
- **App Store Connect events**: `on.app_store_connect` triggers in `asc-events.yml` proxy `app_version`, `build_upload`, `external_beta`, `beta_feedback` state changes to Slack.

## The setup state machine

`vexpo full` is a phase orchestrator. Each phase corresponds to a discrete external state: Convex deployment exists, Better Auth secret is set on Convex env, Apple SIWA JWT is freshly signed, EAS production secrets are pushed, etc. State lives at `.setup-state.json`:

```jsonc
{
  "createdAt": "2026-05-11T14:00:00Z",
  "updatedAt": "2026-05-11T14:00:00Z",
  "lastPid": 12345,
  "steps": {
    "convex": {
      "name": "convex",
      "completedAt": "2026-05-11T14:00:00Z",
      "verifyAt": "2026-05-11T14:00:00Z",
      "outputs": { "deployment": "happy-frog-123" },
    },
  },
  "audit": [
    /* last 50 invocations */
  ],
}
```

Key properties:

- **No secrets**: only IDs and timestamps. Apple's `.p8` content never lands here.
- **Atomic writes**: `writeFile` to `tmp` + `rename`. Ctrl-C mid-write leaves the previous state intact.
- **External services win on disagreement**: `verifyOrInvalidate(name, fn)` re-checks freshness before trusting a cached step. Local cache is not the source of truth.
- **Idempotency**: running `vexpo full` twice with no changes is a no-op.
- **Concurrency check**: `lastPid` + recency window flags a second run while another is in flight, so two terminals don't write the same step.

This is the same pattern as a Terraform plan/apply with a state lock. We use it because external provisioning is slow (Apple ASC API is rate-limited, Convex deployment creation takes 10-30s), and re-running setup must not re-do work that's already done.

## The CLI surface

`vexpo` is deliberately small. The design rule: **don't wrap what `eas` already does well.** For canonical EAS surface (`init`, `build`, `update`, `submit`, `deploy`, `channel`, `branch`, `webhook`, `workflow`, `fingerprint`, `metadata`, `device`, `account`, `env`, `credentials`, `integrations:asc`), use `npx eas <subcommand>` directly. Reinventing those commands inside vexpo would add no value over EAS itself, increase the maintenance surface, and signal a lack of trust in the platform.

`vexpo` exists for what `eas` doesn't do:

1. **Setup orchestration**: `lite` (dev mode), `full` (TestFlight-ready provisioning). Standalone phases: `accounts`, `rebrand`, `review-account`, `convex`, `better-auth`, `resend`. State machine over `.setup-state.json`. Idempotent, drift-aware, resumable. Spawns `eas init` / `eas env:push` / `eas credentials:configure-build` / `eas integrations:asc:connect` as internal setup steps, none exposed as standalone `vexpo` commands. The ASC API key flows through to both `credentials:configure-build` and `integrations:asc:connect` via `EXPO_ASC_API_KEY_*` env vars pre-set from cached state. Notably, `integrations:asc:connect` is invoked with only `--bundle-id` (not `--api-key-id`, which matches against EAS-uploaded key resources rather than Apple-side identifiers).
2. **Cross-source drift detection**: `doctor`. Auth-checks every credential, confirms IDs match across `.env.local` / Convex env / EAS env / `app.config.ts`. No `eas-cli` equivalent.
3. **Apple-side work `eas-cli` doesn't do**: `apple jwt` (SIWA ES256 signing), `apple services-id` (ASC API + manual web walk), `apple asc-key` (validate against `/v1/apps`), `apple eas-rotation-secrets` (push the 5 secrets the JWT cron needs). `apple credentials` itself wraps `eas credentials:configure-build` with the cached ASC API key passed through env vars so the wizard skips the Apple Developer login prompt. Managed EAS Credentials is the only path.
4. **ASC API endpoints `eas-cli` doesn't expose**: `testflight groups`, `testflight testers`, `testflight invite/remove/whats-new`, `reviews list/unanswered/respond`, `sandbox list/create/delete`, `asc:version list/view/phased`, `asc:submissions`.
5. **Multi-destination env sync**: `env push` reads `.env.local` + `.env.prod`, pushes to Convex + EAS env in one pass. Each EAS env command exists separately. vexpo's win is the cross-destination orchestration.

Categories one through five are vexpo's value. Everything else routes to `eas`. `vexpo full` does NOT invoke `eas build`. When provisioning completes, it prints the canonical `eas build -p ios --profile production --auto-submit-with-profile testflight` command for the user to run.

## Performance characteristics

- **AASA endpoint**: 200 bytes of JSON, served from Convex's HTTP router. `Cache-Control: public, max-age=3600, must-revalidate` plus `ETag` so warm callers pay only the round-trip. Apple's on-device AASA cache means each install hits this exactly once per fingerprint generation.
- **OTA bundle size**: ~600 KB minified + brotli for a typical screen tree. With `enableBsdiffPatchSupport: true`, incremental updates land at 10-30 KB on devices that already have the previous bundle.
- **Push token rotation**: `pushTokens` table keyed by `userId` with indexes `by_user`, `by_token`, and `by_revoked_updatedAt` (the cleanup cron walks the last one). Revoked tokens get hard-deleted 30 days after revocation by `crons.ts`. Convex query cost is constant. The cron runs in ~50ms even with 100k users.
- **Setup orchestrator**: `vexpo full` on a fresh project takes ~30 minutes hands-on (mostly Apple Developer Portal manual steps), then ~2 days wall-clock for Apple's identity verification. Re-running on a configured project short-circuits via the state cache in ~3 seconds.

## What's deliberately not solved

- **Apple Developer enrollment**: manual signup, identity verification, $99/year. No automation possible.
- **DNS records for Resend domain verification**: registrar-specific, not automatable.
- **Apple Services ID creation**: Apple removed the ASC API path in 2025. CLI walks the user through the web UI inline.
- **Android + web**: currently iOS. The SwiftUI bridge is the showcase. Native parity follows once `@expo/ui/jetpack-compose` reaches the same surface as `@expo/ui/swift-ui`.
