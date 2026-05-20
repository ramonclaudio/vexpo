# Setup reference

Long-form companion to the README. Walks every phase `npx vexpo full` runs, the prompts you'll see, env-var alternatives for non-interactive runs (CI), recovery paths, and what state ends up where.

The orchestrator is the published [`vexpo` CLI](https://www.npmjs.com/package/vexpo) (run via `npx vexpo lite` (dev) or `npx vexpo full` (TestFlight-ready)). `package.json` exposes every phase as a `npx vexpo <phase-name>` shortcut. State lives in `.setup-state.json` (gitignored), `.env.local` (gitignored), Convex deployment env (server-side), and EAS project env (per-environment, with secret-visibility entries powering the JWT rotation cron).

## TL;DR

```bash
git clone <repo-url> my-app
cd my-app
npm install
npx vexpo full
```

Plan ~30 minutes if your accounts already exist, ~60-90 if you're enrolling in the Apple Developer Program for the first time.

## Setup modes

vexpo has three entry points:

| Mode              | Command              | When                                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Lite (dev)        | `npx vexpo lite`     | Greenfield, dev-mode shortcut. Provisions Convex + Better Auth only. ~60 seconds to the iOS Simulator.           |
| Full (TestFlight) | `npx vexpo full`     | Greenfield, production setup. Walks signups, provisions Resend + Apple + EAS, signs JWTs, rebrands.              |
| Env sync          | `npx vexpo env push` | You already have all values in `.env.local` + `.env.prod`: just push them to Convex env and EAS env. No signups. |

`npx vexpo env push` reads `.env.local` (dev) and `.env.prod` or `.env.production` (prod), classifies each key by destination, and pushes to Convex env and EAS env. Per-file confirmation, fingerprint diff on overwrites, no provisioning. Secret-visibility EAS env vars (rotation cron) need `eas env:create --visibility secret` and the command prints the exact invocations when it sees those keys.

Pick `env push` when:

- Restoring state on a new machine after a wipe.
- Transferring a working setup to a teammate.
- Running setup in CI where signups don't make sense.
- You handled provisioning out-of-band (manual ASC key creation, manual Resend domain setup) and just want to push the resulting values.

Pick `lite` for the 60-second simulator path with no Apple Developer account or domain required. Pick `full` for everything you need to ship to TestFlight.

## Dry runs

All modes accept `--dry-run`. Print every action the script would take, then exit without touching anything.

| Command                        | Output                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npx vexpo full --dry-run`     | One block per phase: action (`run`/`skip (cached)`/`run (interactive)`), summary list of what it does |
| `npx vexpo env push --dry-run` | Per-source-file plan: every key, every destination, with `create`/`update`/`noop` status + diff       |

Use it to:

- Preview a clone-to-shipping flow before running it on a new machine.
- Audit what `--force` would re-run before committing to it.
- Verify in CI that the values in `.env.local` would land in the right places before flipping the switch.
- Compare what a teammate's `.env.prod` would change vs. yours (run `vexpo env push --dry-run` against their file).

`--dry-run` does not hit the network for verification, doesn't prompt for credentials, doesn't write state. It only reads what already exists locally and prints the plan.

## What `npx vexpo full` does

The orchestrator runs the following phases in order, skipping any that are cached fresh in `.setup-state.json`. Each phase is also runnable standalone via `npx vexpo <phase-name>`.

| Phase | Command                                | Layer | What it does                                                                                                   |
| ----- | -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| 0     | `npx vexpo accounts`                   | meta  | Apple Developer / Expo / Convex / Resend signup confirmation                                                   |
| 1     | `npx vexpo rebrand`                    | ours  | Replace template defaults (interactive, only if forking)                                                       |
| 2     | `npx vexpo convex`                     | ours  | Provision Convex deployment, write `.env.local`                                                                |
| 3     | `npx vexpo better-auth`                | ours  | Generate `BETTER_AUTH_SECRET`, push `SITE_URL`, `APP_NAME`                                                     |
| 4     | `npx vexpo resend`                     | ours  | Resend sending key + webhook (manual: DNS records at registrar)                                                |
| 5     | `npx vexpo review-account`             | ours  | Seed App Review demo account on Convex                                                                         |
| 6     | `npx vexpo full` (EAS phase)           | eas   | Thin wrapper: `eas init` + `eas env:push` from `.env.local`                                                    |
| 7     | `npx vexpo apple asc-key`              | ours  | Validate ASC API key against ASC `/v1/apps` (no upload)                                                        |
| 7.5   | `npx vexpo apple credentials`          | ours  | Wraps `eas credentials -p ios`. Pre-passes cached ASC creds, EAS auto-generates dist cert + profile + push key |
| 8     | `npx vexpo apple services-id`          | ours  | Attach SIWA capability via ASC API (manual: create the Services ID itself)                                     |
| 9     | `npx vexpo apple jwt`                  | ours  | Sign SIWA ES256 client_secret JWT, push to Convex env                                                          |
| 10    | `npx vexpo apple eas-rotation-secrets` | ours  | Push the 5 EAS production secrets the JWT rotation cron needs                                                  |

Phases marked "manual" pause the CLI while you do something a Resend dashboard or Apple Developer portal can't be automated through. The CLI prints exact instructions and waits for you to press Enter.

After this, the iOS-platform commands are all `eas-cli`:

```
eas credentials -p ios       # dist cert + provisioning profile + push key + upload ASC API key
eas build -p ios --profile production
eas submit -p ios --profile production    # auto-creates the App Store record on first run
```

We don't reinvent any of those, `eas-cli` owns the iOS platform layer end-to-end. The EAS init phase is a thin wrapper that does `eas init` + `eas env:push` because the orchestrator wants one entry point for the env mirror. You can run those two commands directly and skip our wrapper entirely.

## Phase 0: Accounts (`npx vexpo accounts`)

Splits "things you bring" from "things vexpo signs you up for":

### Manual pre-reqs (we don't walk through, just confirm)

| Pre-req                  | Why we don't automate                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apple Developer ($99/yr) | Apple requires identity verification, payment, signed agreements. 24-48h to verify. Org accounts also need a D-U-N-S number.                     |
| Domain + DNS access      | Domain registration is per-registrar with payment + WHOIS verification. Any registrar works (Cloudflare, GoDaddy, Route 53, Namecheap, Vercel…). |

For both, the script asks "do you have this?" and prints links if you don't. If you say no, the orchestrator continues but downstream Apple/email phases will fail with clear errors when they try to use what's missing.

### Instant signups (we walk you through)

| Account | Validation                                                |
| ------- | --------------------------------------------------------- |
| Convex  | `~/.convex/config.json` exists after `npx convex login`   |
| Expo    | `npx eas whoami` returns a username after `npx eas login` |
| Resend  | `RESEND_FULL_ACCESS_KEY` env probes 200 on `/api-keys`    |

Each opens the signup page (free-tier accounts, instant), then runs the corresponding CLI login. For Resend, paste a full-access key into the env once: `export RESEND_FULL_ACCESS_KEY=re_...` (the script also prompts interactively if absent). The key is never persisted by vexpo, it's used to provision a scoped sending key + webhook, then forgotten.

### What you'll be prompted for in later phases

| Phase                     | What it needs from you                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vexpo apple asc-key` | App Store Connect API key (issuer ID, key ID, .p8), created at [appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api) |
| `npx vexpo apple jwt`     | Sign In with Apple key (key ID, .p8), created at [developer.apple.com/account/resources/authkeys/list](https://developer.apple.com/account/resources/authkeys/list)           |
| DNS records               | Added by you at your registrar after `npx vexpo resend`. Resend's dashboard shows them and verifies. We don't automate this.                                                  |

Skip the whole phase: `npx vexpo full  # (accounts walk only runs with --new)`.

## Phase 1: Rebrand (`npx vexpo rebrand`)

Interactive wizard for forks. Detects template defaults like `com.example.vexpo`, `slug: "vexpo"`, `scheme: "vexpo"`. Prompts for:

- App name (e.g. "Foobar")
- Package name (lowercase, hyphenated, e.g. "foobar")
- Bundle ID (e.g. `com.yourname.foobar`)
- URL scheme (used for deep links, default = package name)
- Your name + Expo owner slug (optional, org/team if applicable)
- Apple review contact email + phone
- Marketing / support / privacy URLs
- Copyright owner

Edits:

- `app.config.ts`, `name`, `slug`, `scheme`, `BUNDLE_ID` env-var fallback
- `app.json`, clears stale `extra.eas.projectId` (next `eas init` regenerates)
- `package.json`, `name`, `version` reset to `0.1.0`
- `store.config.json`, regenerated from example with prompted values

Backups land in `.rebrand-backup/<timestamp>/` before any write. Idempotent: re-runs detect "already rebranded" via state and skip unless `--force` is passed.

Skip: `npx vexpo full --skip-rebrand`. Or pre-detect by reading from `.env.local` (`EXPO_PUBLIC_APP_BUNDLE_ID`). If it differs from `com.example.vexpo`, the orchestrator marks the step `cached`.

## Phase 2: Convex (`npx vexpo convex`)

Provisions a fresh Convex deployment (or connects to an existing one). Writes:

- `.env.local`: `CONVEX_DEPLOYMENT`, `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CONVEX_SITE_URL`, `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_APP_BUNDLE_ID`, `EXPO_PUBLIC_APPLE_TEAM_ID`
- Convex env: `APP_BUNDLE_ID`, `APPLE_TEAM_ID` (used by `convex/http.ts` to serve `/.well-known/apple-app-site-association`)

Prompts for the iOS bundle ID (reverse DNS, e.g. `com.yourname.myapp`) and your 10-character Apple Team ID (in Apple Developer → Membership). Both can be provided non-interactively via `EXPO_PUBLIC_APP_BUNDLE_ID` and `EXPO_PUBLIC_APPLE_TEAM_ID` env vars.

`--fresh` wipes `.env.local` and reprovisions a brand new deployment. `--local` runs against `npx convex dev --local` (self-hosted backend).

## Phase 3: Better Auth (`npx vexpo better-auth`)

Generates a 32-byte base64 `BETTER_AUTH_SECRET`. Sets `SITE_URL`, `APP_NAME` on Convex. No prompts, no env required.

If `BETTER_AUTH_SECRET` is already set on Convex, the script preserves it.

## Phase 4: Resend (`npx vexpo resend`)

Prompts once for a Resend full-access key (or reads `RESEND_FULL_ACCESS_KEY`). Picks a verified domain (or the first one if there's only one). Creates:

- A scoped sending key named `<pkg.name>` (deletes any existing key with the same name first)
- A webhook pointing at `<convex-site-url>/resend-webhook`, signed with a fresh secret

Sets on Convex: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM=<pkg.name>@<domain>`, `RESEND_TEST_MODE=false`.

`RESEND_TEST_MODE=true` (default at provision time, flipped to `false` here) sends OTPs to Convex logs instead of real email, useful during local dev. Override `EMAIL_FROM` via `--from`.

### DNS records (you add these yourself)

We don't automate DNS. Resend's dashboard at `resend.com/domains/<id>` shows the SPF/DKIM/DMARC records the domain needs and verifies them when you add them at your registrar. Resend has per-provider guides for every common registrar (Cloudflare, GoDaddy, Route 53, Namecheap, Vercel, etc.), pick yours from the dashboard's "Add records" panel.

This is the one thing that gates real email sending. Until the domain is verified, every send returns a `validation_error` from Resend.

### Webhook event subscription

The webhook subscribes to 9 events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`, `email.opened`, `email.clicked`. The 4 actionable failure events (`bounced`, `complained`, `suppressed`, `failed`) tell you when a user's address is dead. `convex/email.ts` logs them with `console.warn` and you extend `handleEmailEvent` to flag the user account if you want to stop retrying. `opened` and `clicked` only fire when per-email tracking is enabled (we don't enable it by default, toggle on individual sends if you want it).

`npx vexpo doctor` confirms the webhook subscription includes all 4 actionable events. If you ever drop one accidentally, re-run `npx vexpo resend` to refresh.

### Sign In with Apple + Hide My Email (Apple Private Email Relay)

If you ship Sign In with Apple (Phases 7-9), users who select "Hide My Email" get an `*@privaterelay.appleid.com` address. Apple proxies email to their real inbox, but Apple won't deliver from sender domains it doesn't trust. You need to register your sending domain at [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles → More → "Sign in with Apple for Email Communication" → Configure. Add:

- Your sending domain (e.g. `mailer.example.com`)
- Every from-address you send from (e.g. `vexpo@mailer.example.com`)

Resend authenticates via SPF + DKIM by default, which is what Apple wants. So once your domain is verified at Resend AND registered at Apple, Hide My Email users receive OTPs normally. Skip this step and you'll see `email.bounced` events for every relay address, the symptom looks like "Sign In with Apple users never get the verification email".

Apple imposes a 100/day limit per relay address, but that's a per-user cap, not a per-app one.

## Phase 5: Review account (`npx vexpo review-account`)

Reads `apple.review.demoUsername` / `demoPassword` from `store.config.json`. Creates the user via Better Auth's signup flow, then flips `emailVerified: true` directly via the adapter so Apple's reviewer doesn't see an OTP prompt.

Pass `--email` / `--password` to override the values from `store.config.json`. Same creds you paste into App Store Connect → App Information → App Review → Sign-In Information.

## Phase 6: EAS (auto, no standalone command, runs as part of `vexpo full`)

Runs `eas init` (creates the project, or links to an existing one) and writes `extra.eas.projectId` to `app.json`. Mirrors every `EXPO_PUBLIC_*` from `.env.local` to the EAS `development` environment using `npx eas env:create --visibility plaintext`. Prod and preview values come from `.env.prod` via `vexpo env push`, which routes to `["production", "preview"]`.

After this, `expo prebuild` and `eas build` both find the right project + env. The `extra.eas.projectId` write also enables `app.config.ts → updates.url`.

## Phase 7: ASC API key (`npx vexpo apple asc-key`)

The App Store Connect API key is needed for `eas submit` (and for vexpo's Phase 8 Services ID provisioning). The first key has to be created in the ASC web UI, there's no bootstrap path because you can't authenticate the API without already having a key.

Walks you to https://appstoreconnect.apple.com/access/integrations/api, prints step-by-step instructions:

1. Click "Generate API Key" (top-right). Name it (e.g. `vexpo-asc`).
2. Set the role to "Admin" or "App Manager" (lower roles can't create bundle IDs).
3. Click "Generate". The key cannot be retrieved later, save the .p8 file.
4. From the table: copy the Issuer ID (above the table) and the Key ID.

Then prompts for issuer ID, key ID, and `.p8` path. Validates by signing an ES256 JWT and calling `GET /v1/apps`. Re-prompts up to 3x with specific error messaging on failure (`401` = bad token, `403` = role insufficient, etc.).

Records `{issuerId, keyId, p8Path, validatedAt}` in `.setup-state.json`. The .p8 file itself stays where you put it, vexpo never copies it.

Env-var skip: `APPLE_ASC_ISSUER_ID=... APPLE_ASC_KEY_ID=... APPLE_ASC_P8_PATH=/path/to/AuthKey_X.p8 npx vexpo apple asc-key`.

Re-validate cached creds without re-prompting: `npx vexpo apple asc-key --revalidate`.

## Phase 7.5: EAS iOS credentials (`npx vexpo apple credentials`)

`npx vexpo apple credentials` wraps the eas-cli wizard. With our env-var pre-passing (`EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`), the wizard skips Apple Developer login entirely. You walk through ~6 Y/n prompts (each "Generate new" or "Use existing"), each takes 1-2 seconds. Apple's API does the actual work server-side.

What the wizard sets up:

- **iOS distribution certificate** generated via Apple's API
- **Provisioning profile** linked to the dist cert + your bundle id
- **APNs push notification key** linked to your bundle id, generated via Apple's API
- **App Store Connect API key uploaded to EAS** (used for `eas submit`)

All credentials are stored encrypted on EAS infrastructure. Subsequent `eas build` + `eas submit` runs are non-interactive.

Standalone: `npx vexpo apple credentials [-e <profile>]`.

Bypass entirely: `npx eas credentials -p ios` runs the wizard directly. The vexpo wrapper just pre-passes the cached ASC creds.

## Phase 8: Sign In with Apple Services ID (`npx vexpo apple services-id`)

The Services ID is a separate `BundleId` resource (with `platform: "SERVICES"`) used by your backend to identify the OAuth client to Apple. EAS doesn't manage these. The regular bundle ID it provisions is for the iOS app itself, not the OAuth backend.

**Apple removed the API path that created Services IDs.** `POST /v1/bundleIds` rejects `platform: "SERVICES"` as of 2025. The CLI works around this by detecting existing Services IDs via `GET` and walking you through manual creation in the developer portal if it doesn't exist yet.

Reads ASC API creds from state (set by Phase 7) or from `APPLE_ASC_*` env. Reads the bundle ID from `.env.local`. Then:

1. `GET /v1/bundleIds?filter[identifier]=<bundle>`, find the App's primary bundle id resource (any non-SERVICES platform, newer accounts report `UNIVERSAL`).
2. `GET /v1/bundleIds?filter[identifier]=<bundle>.signin`, find the Services ID. **If missing**, the CLI prints step-by-step instructions for [the web UI](https://developer.apple.com/account/resources/identifiers/list/serviceId) and waits. After you register it, press Enter and the CLI re-polls.
3. `GET /v1/bundleIds/<app>/bundleIdCapabilities`, find the Sign In with Apple capability on the App ID. If absent, create via `POST /v1/bundleIdCapabilities` with `capabilityType: "APPLE_ID_AUTH"`.
4. Write `APPLE_SERVICES_ID` to `.env.local`.

Default Services ID identifier is `<bundle-id>.signin`. Override via `--services-id` or `APPLE_SERVICES_ID` env.

Idempotent: every step is find-only-or-attach. Re-runs do nothing if everything exists.

Records resource IDs in state for future audit.

### Manual web UI: creating the Services ID

If Phase 8 prompts you to create the Services ID, here's the exact flow:

1. Open [developer.apple.com/account/resources/identifiers/list/serviceId](https://developer.apple.com/account/resources/identifiers/list/serviceId)
2. Confirm the dropdown in the top right says **Services IDs** (not "App IDs")
3. Click `+`, pick **Services IDs**, Continue
4. Description: `<App Name> Sign In` (any string)
5. Identifier: the value the CLI told you, typically `<bundle>.signin`
6. Continue → Register
7. Click into the new Services ID, check **Sign in with Apple**, click Configure
8. Primary App ID: your existing App ID (e.g. `com.you.app`)
9. Domains and Subdomains: any HTTPS domain you control (Apple may verify ownership)
10. Return URLs: any `https://<your-domain>/anything` URL
11. Save

Apple may ask you to upload an `apple-developer-domain-association.txt` to verify domain ownership. If so, host it at `https://<your-domain>/.well-known/apple-developer-domain-association.txt` (Vercel: drop in `public/.well-known/`). Apple sometimes skips verification for first-time setups. If no upload is requested, you're done.

After saving, return to the CLI and press Enter. The CLI re-lists, finds the Services ID, attaches the capability via API, and continues to Phase 9.

## Phase 9: Apple Sign In JWT (`npx vexpo apple jwt`)

Signs an ES256 `client_secret` JWT (180-day expiry, Apple's max) from a Sign In with Apple `.p8` file. Writes:

- Convex env: `APPLE_CLIENT_ID` (= Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_SECRET` (the signed JWT)

The `.p8` here is the **Sign In with Apple key**, not the ASC API key. Apple uses `AuthKey_<KEYID>.p8` as the filename for both, they're different keys with different capabilities. Look up the Key ID at https://developer.apple.com/account/resources/authkeys/list to confirm.

Prompts:

1. Services ID (read from `.env.local` after Phase 8, or prompted)
2. Team ID (10 chars, from Apple Developer → Membership)
3. Key ID (10 chars, shown next to the Sign In with Apple key)
4. Path to `.p8`

Records `{servicesId, teamId, keyId, p8Path, signedAt, expiresAt}` in state.

Env-var skip: `APPLE_SERVICES_ID=... APPLE_TEAM_ID=... APPLE_KEY_ID=... APPLE_P8_PATH=/path/to/AuthKey_X.p8 npx vexpo apple jwt`.

Rotate without re-prompting IDs: `npx vexpo apple jwt --rotate`.

### JWT rotation

Apple caps `client_secret` JWTs at 180 days. The `.eas/workflows/rotate-apple-jwt.yml` cron fires every 90 days, signs a fresh JWT, and pushes it to your prod Convex deployment. Runs on EAS infrastructure with all secrets read from EAS env (production, secret visibility), no GitHub repo secrets needed. Set up once, never think about it again. Manual fallback: `npx vexpo apple jwt --rotate`.

## Phase 10: EAS rotation secrets (`npx vexpo apple eas-rotation-secrets`)

Pushes the 5 EAS production secrets the rotation cron needs. The orchestrator runs this last. It's also a standalone command.

| Var                    | Value source                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `APPLE_P8_PRIVATE_KEY` | PEM contents of the SIWA `.p8` (file from Phase 9)               |
| `APPLE_TEAM_ID`        | 10-char Apple Team ID (read from `.env.local`)                   |
| `APPLE_KEY_ID`         | 10-char Sign In with Apple key ID (read from `.env.local`)       |
| `APPLE_SERVICES_ID`    | Services ID (read from `.env.local`)                             |
| `CONVEX_DEPLOY_KEY`    | Convex dashboard → Project → Settings → Deploy keys (production) |

The 4 Apple secrets get pulled automatically. `CONVEX_DEPLOY_KEY` is prompted because the CLI can't generate Convex deploy keys, you create it once in the Convex dashboard and paste it back.

```bash
npx vexpo apple eas-rotation-secrets           # interactive
npx vexpo apple eas-rotation-secrets --force   # overwrite existing values
```

If you'd rather run the raw `eas env:create` calls yourself:

```bash
eas env:create --name APPLE_P8_PRIVATE_KEY  --value "$(cat /path/to/SIWA.p8)" --environment production --visibility secret
eas env:create --name APPLE_TEAM_ID         --value <value>                   --environment production --visibility secret
eas env:create --name APPLE_KEY_ID          --value <value>                   --environment production --visibility secret
eas env:create --name APPLE_SERVICES_ID     --value <value>                   --environment production --visibility secret
eas env:create --name CONVEX_DEPLOY_KEY     --value <prod-deploy-key>         --environment production --visibility secret
```

`npx vexpo doctor --channel prod` lists which of the 5 are present (names appear, values stay opaque since they're secret visibility).

## What `npx vexpo full` does NOT do

These are explicit non-goals, EAS or third parties already handle them well:

- **iOS distribution cert / provisioning profile / push notification key (.p8)** are EAS-owned. We wrap the `eas credentials -p ios` wizard via `npx vexpo apple credentials` so the orchestrator records that it ran, but eas-cli does the work.
- **iOS bundle ID for the app**, EAS auto-creates on first `eas credentials -p ios` if it doesn't exist.
- **iOS capability sync**, EAS auto-syncs from `ios.entitlements` (which `app.config.ts` populates from `usesAppleSignIn: true`, `expo-notifications`, `associatedDomains`, etc.) on every `eas build`.
- **App Store Connect app record**, `eas submit` auto-creates on first run from `app.config.ts → name` + `package.json → name`.
- **Apple Developer account creation**, manual signup, $99/yr, identity verification, 2FA.

## Lite-mode env sync (`npx vexpo env push`)

```bash
npx vexpo env push                              # interactive (per-file confirm)
npx vexpo env push --force                      # overwrite without prompting
npx vexpo env push --dry-run                    # show plan, don't apply
npx vexpo env push --local-file foo             # override .env.local path
npx vexpo env push --prod-file foo              # override .env.prod path
```

Lite mode reads source files and pushes values to remote destinations. Zero provisioning, no API calls beyond `convex env set --from-file` and `eas env:push --path`.

### Source files

| File              | Channel | Default destinations                                    |
| ----------------- | ------- | ------------------------------------------------------- |
| `.env.local`      | dev     | Convex dev env, EAS development env                     |
| `.env.prod`       | prod    | Convex prod env, EAS production+preview                 |
| `.env.production` | prod    | (used if `.env.prod` is absent)                         |

Override paths with `--local-file` / `--prod-file`. Both files are optional, lite mode runs with whatever it finds.

### Routing

Each known env-var has a fixed routing in `vexpo`'s env-files module ([source](https://github.com/ramonclaudio/vexpo/blob/main/packages/vexpo/src/lib/env-files.ts)):

| Source key                              | Convex (dev)      | Convex (prod)     | EAS env               |
| --------------------------------------- | ----------------- | ----------------- | --------------------- |
| `EXPO_PUBLIC_*`                         | n/a               | n/a               | dev (or prod+preview) |
| `BETTER_AUTH_SECRET`                    | dev               | prod              | n/a                   |
| `RESEND_API_KEY`                        | dev               | prod              | n/a                   |
| `RESEND_WEBHOOK_SECRET`                 | dev               | prod              | n/a                   |
| `RESEND_TEST_MODE`, `EMAIL_FROM`        | dev               | prod              | n/a                   |
| `APP_NAME`, `SITE_URL`, `APP_BUNDLE_ID` | dev               | prod              | n/a                   |
| `APPLE_CLIENT_ID`                       | dev               | prod              | n/a                   |
| `APPLE_CLIENT_SECRET`                   | dev               | prod              | n/a                   |
| `APPLE_TEAM_ID`                         | dev               | prod              | n/a                   |
| `APPLE_KEY_ID`                          | dev               | prod              | n/a                   |
| `APPLE_SERVICES_ID`                     | `APPLE_CLIENT_ID` | `APPLE_CLIENT_ID` | n/a                   |
| `APPLE_P8_PRIVATE_KEY`                  | n/a               | n/a               | n/a                   |
| `CONVEX_DEPLOY_KEY`                     | n/a               | n/a               | n/a                   |

The five rotation-cron secrets (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `APPLE_P8_PRIVATE_KEY`, `CONVEX_DEPLOY_KEY`) live in EAS env at `secret` visibility but `vexpo env push` does not write them — run `npx vexpo apple eas-rotation-secrets` once to push the full set.

Notes:

- `APPLE_SERVICES_ID` is renamed to `APPLE_CLIENT_ID` on Convex (Better Auth's expected key name).
- GitHub secrets only get pushed from `.env.prod`, they're consumed by the prod-only JWT rotation cron.
- `CONVEX_DEPLOYMENT` is ignored entirely (file-local pointer used by the Convex CLI, not synced).
- Anything else is reported as "unrecognized" and skipped.

### Conflict handling

For each (key, destination) pair, lite mode classifies the action:

| Status    | Meaning                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `create`  | Destination doesn't have this key.                                        |
| `update`  | Destination has a different value. Prints fingerprint diff (`fp: X → Y`). |
| `noop`    | Destination already has this exact value.                                 |
| `blocked` | Destination unavailable (no EAS project, etc.).                           |

Per-file confirmation: lite mode prints the full plan, then asks "Apply `<file>` (`<channel>`)?" before each file's writes. Pass `--force` to skip prompts. `--dry-run` prints the plan and exits without writing.

Secret-visibility EAS env vars (`APPLE_P8_PRIVATE_KEY`, `CONVEX_DEPLOY_KEY`) aren't routed by lite, `eas env:push --path` doesn't accept a visibility flag, and we won't push secrets at default visibility. If they appear in `.env.prod`, lite prints the exact `eas env:create --visibility secret` commands you need to run instead.

### When NOT to use lite mode

- You don't have all the values yet. Lite mode doesn't generate `BETTER_AUTH_SECRET`, doesn't sign Apple JWTs, doesn't create Resend keys. Use full mode for first setup.
- You haven't run `eas init` yet. Lite mode pushes to EAS env but won't init the project, run full mode or `npx eas init && npx eas env:push --path .env.local` once first.

### Example flow

Move a working app to a new machine:

```bash
# On the old machine:
npx convex env list > /tmp/dev-env
npx convex env list --prod > /tmp/prod-env
# Edit each into .env.local / .env.prod with the values you want carried over.

# On the new machine:
git clone <repo>
cd <repo>
npm install
npx vexpo env push           # syncs from those files
npx eas credentials -p ios  # re-uploads cert / profile / keys
npm run convex:dev
npm run ios
```

## Verification (`npx vexpo doctor`)

```bash
npx vexpo doctor                    # verify dev (default)
npx vexpo doctor --channel prod     # verify prod (Convex --prod env)
npx vexpo doctor --json             # machine-readable output
npx vexpo doctor --strict           # exit non-zero on warnings
```

Runs a battery of checks that auth-test each credential and cross-reference the values across `.env.local`, Convex env, EAS env, GitHub secrets, and `app.config.ts`. Lite mode runs the same battery automatically after sync (skip with `--no-verify`). Results are grouped by category:

| Category    | What's checked                                                                                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`     | `.env.local` / `.env.prod` exist and have the expected `EXPO_PUBLIC_*` keys.                                                                                                                                                                                                                                                 |
| `convex`    | Deployment URL reachable. `cloud` and `site` slugs match. `BETTER_AUTH_SECRET` is at least 32 bytes.                                                                                                                                                                                                                         |
| `resend`    | `RESEND_API_KEY` authenticates. `EMAIL_FROM` domain is in the verified Resend domains. Webhook points at Convex site.                                                                                                                                                                                                        |
| `apple`     | JWT decodes. `header.kid === APPLE_KEY_ID`. `payload.iss === APPLE_TEAM_ID`. `payload.sub === APPLE_CLIENT_ID`. `aud` correct. Expiry warns at <30d, fails if expired. ASC API key still authenticates (if cached). Services ID exists in App Store Connect.                                                                 |
| `eas`       | Project ID present in `app.json`. Signed in. Required `EXPO_PUBLIC_*` env vars mirrored to all three EAS environments. All 5 rotation-cron secrets (`CONVEX_DEPLOY_KEY`, `APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`) present in production env (names only, values are secret-visibility). |
| `coherence` | Cross-reference: `EXPO_PUBLIC_APP_BUNDLE_ID === Convex APP_BUNDLE_ID`, team IDs match, Services IDs match, app names match `app.config.ts`.                                                                                                                                                                                  |

Each check has a severity:

- `ok`, passes.
- `warn`, works but suspicious (JWT expires in 14d, BETTER_AUTH_SECRET shorter than 32b, EAS not signed in).
- `fail`, broken (JWT expired, bundle ID mismatch between local and Convex, Resend API key rejected).
- `skip`, can't be checked (no `.env.prod`, ASC creds not cached, EAS not signed in).

Exit status: `0` for ok+warn, `1` if any fail, `1` for warn under `--strict`. Run after every `npx vexpo env push` to confirm nothing drifted, in CI to catch credential rotation issues, or after a `npx vexpo apple jwt --rotate` to confirm the new JWT is signed correctly.

The check that catches the most real-world bugs: `apple/jwt-iss-matches`. Apple JWTs are easy to sign with the wrong Team ID, happens when you reuse a `.p8` from another project. Verify catches it instantly.

## Iterating: post-setup commands

```bash
npm run convex:dev                                              # T1: Convex functions
npm run ios                                                     # T2: prebuild + simulator

npx eas build -p ios --profile production                      # production iOS build
npx eas submit -p ios --profile production                     # auto-creates the App Store record on first run
npm run eas:tf                                                  # build + auto-submit to TestFlight
npx eas metadata:push                                          # push store.config.json to App Store Connect
npx eas credentials -p ios                                     # manage iOS dist cert / profile / keys
```

EAS Workflows (`.eas/workflows/`) automate these for you on push to `main`, push tag `v*`, push to `beta/*`, on PR, and on `eas workflow:run`.

## Recovery: rotating things

| Thing                      | Command                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| Convex deployment          | `npx vexpo full --fresh`                                         |
| Better Auth secret         | `npx vexpo better-auth --force`                                  |
| Resend key + webhook       | `npx vexpo resend`                                               |
| Apple Sign In JWT (manual) | `npx vexpo apple jwt --rotate`                                   |
| Apple Sign In JWT (auto)   | EAS Workflows → `rotate-apple-jwt` → Run                         |
| ASC API key                | `npx vexpo apple asc-key` (re-runs validation)                   |
| EAS env mirror             | `npx eas init && npx eas env:push --path .env.local --skip-init` |
| EAS rotation secrets       | `npx vexpo apple eas-rotation-secrets --force`                   |
| State cache                | `trash .setup-state.json`                                        |

## Recovery: things break

`.setup-state.json` corrupt or schema mismatch:

```
trash .setup-state.json
npx vexpo full --no-state          # full live re-probe
```

`.env.local` deleted, but Convex deployment still exists:

```
npx eas env:pull --environment development          # pulls EXPO_PUBLIC_*
echo "CONVEX_DEPLOYMENT=dev:happy-frog-123" >> .env.local
```

`npm run ios` fails with provisioning profile errors:

```
npx eas credentials -p ios       # interactive wizard, regenerate cert/profile
```

Resend domain unverified or DNS records changed:

Open `https://resend.com/domains/<id>`. Resend shows what's missing. Add the records at your registrar, then click Verify in the dashboard. We don't automate this.

ASC API key revoked or replaced:

```
npx vexpo apple asc-key             # validates cached, prompts for new on failure
npx eas credentials -p ios       # re-upload to EAS
```

## CI

Use `--no-state` to ignore the local state cache. Provide every interactive value via env. The orchestrator runs in non-TTY mode and skips any step that would prompt without env-var fallbacks.

```yaml
- run: npm install
- run: npx vexpo full --no-state --skip-rebrand
  env:
    EXPO_PUBLIC_APP_BUNDLE_ID: com.yourname.myapp
    EXPO_PUBLIC_APPLE_TEAM_ID: ABCDE12345
    RESEND_FULL_ACCESS_KEY: ${{ secrets.RESEND_FULL_ACCESS_KEY }}
    APPLE_ASC_ISSUER_ID: ${{ secrets.APPLE_ASC_ISSUER_ID }}
    APPLE_ASC_KEY_ID: ${{ secrets.APPLE_ASC_KEY_ID }}
    APPLE_ASC_P8_PATH: /tmp/AuthKey.p8
    APPLE_TEAM_ID: ABCDE12345
    APPLE_KEY_ID: FGHIJ67890
    APPLE_SERVICES_ID: com.yourname.myapp.signin
    APPLE_P8_PATH: /tmp/AuthKey_SIWA.p8
    CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

## Files

| Path                               | Purpose                                                | Source of truth                                                                   |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `.env.local`                       | Public env (build-time + Convex URL)                   | written by setup                                                                  |
| `.setup-state.json`                | Per-step verifyAt cache (gitignored)                   | written by setup, read by orchestrator                                            |
| Convex env (`npx convex env list`) | Server-side secrets                                    | written by setup                                                                  |
| EAS env (`npx eas env:list`)       | Build-time env per environment + rotation cron secrets | written by the EAS phase of `vexpo full` + `npx vexpo apple eas-rotation-secrets` |
| `app.config.ts`                    | Expo app config (reads `.env.local`)                   | edited by rebrand                                                                 |
| `app.json`                         | Static `eas.projectId`                                 | written by `eas init`                                                             |
| `store.config.json`                | App Store metadata + review contact                    | edited by rebrand, gitignored                                                     |
| `package.json`                     | Project metadata                                       | edited by rebrand                                                                 |

## State schema

`.setup-state.json` v1 layout:

```ts
type StepRecord = {
  name: StepName;
  completedAt: string; // ISO 8601
  stateVersion: 1;
  scriptVersion?: string;
  outputs?: Record<string, unknown>; // resource IDs, paths, names, never secrets
  verifyAt?: string;
};

type AuditEntry = {
  invokedAt: string;
  args: string[];
  pid: number;
  bunVersion: string;
  cwd: string;
  completed: StepName[];
  skipped: StepName[];
  failed?: { step: StepName; message: string };
};

type SetupState = {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  lastPid: number;
  steps: Partial<Record<StepName, StepRecord>>;
  audit: AuditEntry[]; // capped at 50 entries
};
```

Atomic writes via `tmp + rename`. Schema mismatches fail-loud, `setup` will refuse to run until you `trash .setup-state.json` or upgrade.

## Security

| Class                 | Lives in                                                       | Rotates                                                   |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `BETTER_AUTH_SECRET`  | Convex env                                                     | rotate via `npx vexpo better-auth --force`                |
| Resend sending key    | Convex env (`RESEND_API_KEY`)                                  | `npx vexpo resend` deletes the named key + recreates      |
| Resend webhook secret | Convex env (`RESEND_WEBHOOK_SECRET`)                           | rotated alongside the key                                 |
| Apple Sign In JWT     | Convex env (`APPLE_CLIENT_SECRET`)                             | 180-day max, auto-rotated by EAS Workflows cron every 90d |
| Apple Sign In `.p8`   | EAS env `APPLE_P8_PRIVATE_KEY` (secret visibility, production) | rotate the key in Apple Developer Console                 |
| ASC API `.p8`         | filesystem (path you choose) + state cache                     | manual, rotate via App Store Connect → Integrations       |
| `CONVEX_DEPLOY_KEY`   | EAS env (production, secret visibility)                        | rotate at Convex Dashboard → Settings → Deploy Keys       |

`.setup-state.json` only stores resource IDs, file paths, and timestamps, not secrets. Safe to share for debugging.

The Resend full-access key is used once to provision a scoped sending key + webhook, then discarded. It's never persisted.
