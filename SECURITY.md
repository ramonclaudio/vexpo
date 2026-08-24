# Security

## Report a security issue

For vulnerabilities in vexpo's own code, open a private security advisory at `https://github.com/ramonclaudio/vexpo/security/advisories/new`. Please don't file public issues.

For vulnerabilities in dependencies (Expo, Convex, Better Auth, Resend), report upstream first per their disclosure policies. I'll bump the affected dependency and ship a patched release once upstream has a fix.

## Defenses, by surface

### Inbound webhooks (EAS, Resend, future Stripe and GitHub)

The `convex/webhook.ts` factory wraps every signed POST handler with:

- Constant-time HMAC (hash-based message authentication code) verification, with the algorithm following what the source declares, SHA-1 for EAS and SHA-256 for Stripe. A mismatch returns 401 with a request ID and no body details.
- A body size cap, 1 MiB by default. The `Content-Length` header is checked first, then the body is read as a stream and aborted the moment it passes the cap, so a client that lies about its length can't make the factory buffer the whole body.
- An optional replay window. EAS doesn't sign a timestamp and Stripe does, so when you opt in, the factory checks `|now - t| < maxAgeSeconds`.
- A per-request correlation ID, returned as `X-Request-Id` and logged on every line.
- A structured access log, one-line JSON to Convex's log surface, covering `webhook.ok`, `webhook.bad_signature`, `webhook.too_large`, `webhook.stale`, and `webhook.handler_error`.

Better Auth routes (`authComponent.registerRoutesLazy`) handle their own cross-site request forgery and session protection, per Better Auth's spec.

### OTA updates

- `runtimeVersion: { policy: "fingerprint" }`. A native change auto-bumps the hash, so an over-the-air (OTA) update can never load against an incompatible binary. `@expo/fingerprint >= 0.19.3` makes the policy deterministic across machines and CI by default, so the template needs no `fingerprint.config.js` and no JSI entry in `.fingerprintignore`.
- End-to-end code signing is wired. `app.config.ts` detects `certs/certificate.pem` at config-eval time and turns on `codeSigningCertificate` and `codeSigningMetadata`. `deploy-production.yml`'s `update_ios` job passes `private_key_path: "$EAS_UPDATE_PRIVATE_KEY"` so `eas update` signs locally before publish. Two one-time steps activate it:
  1. Generate the keypair:
     ```bash
     npm run updates:gen-cert -- --name "Your Organization Name"
     ```
     Writes `certs/certificate.pem` (commit it) and `../keys/private-key.pem` (do not commit).
  2. Upload the private key to EAS as a file-type secret:
     ```bash
     eas env:create --environment production --visibility secret \
       --type file --name EAS_UPDATE_PRIVATE_KEY \
       --value ../keys/private-key.pem
     ```

  After that, every bundle is signed during `eas update` and verified on-device against the bundled cert before install. If the env var is unset, `eas update` skips signing without erroring.

- Gradual rollouts come from `rollout.yml`, which publishes an update at the percentage you pass, or edits the percentage of the active rollout.
- Rollbacks go through `rollback.yml`, which runs `update:republish` or `update:roll-back-to-embedded` non-interactively.

### Apple credentials

- `.p8` keys never land in committed files. Template `.gitignore` matches Apple's default download names (`AuthKey_*`, `SubscriptionKey_*`, `*.p8`). The state cache stores only paths, never contents.
- Sign in with Apple (SIWA) token rotation runs on EAS, not GitHub. Apple caps the `client_secret` JSON Web Token (JWT) at 180 days and an expired one silently breaks every new sign-in, so `rotate-apple-jwt.yml` re-signs on a cron (`0 12 1 */3 *`). Reads `APPLE_P8_PRIVATE_KEY` and the other signing inputs from EAS env at `secret` visibility, never logged.
- Build credentials are EAS-managed only. EAS holds the dist cert, provisioning profile, and push key. `vexpo apple credentials` passes the cached App Store Connect (ASC) key to `eas credentials:configure-build` via env vars, so the credentials never leave EAS.
- `vexpo apple asc-key` validates the ASC API key by calling `GET /v1/apps` and rejecting anything other than 200, so a key that authenticates but lacks capabilities is caught at validation time, not submit time.

### Account deletion

Apple App Store Review 5.1.1(v) requires in-app account deletion. vexpo does a soft delete with a 30-day window:

- `users.deleteAccount` marks the row deleted instead of purging it. It sets `deletedAt: Date.now()` and drops every Better Auth session and push token, so the device signs out and notifications stop. Credentials, account rows, and Apple links survive the window.
- `users.restoreAccount` clears that mark. A user who signs back in within 30 days sees `getMe` return a row with `deletedAt` set, so route them to a restore-or-continue surface and call `restoreAccount`.
- `internal.users.hardDeleteExpired` cron runs daily at 04:00 UTC. For each row past the window it revokes Apple Sign In refresh tokens, since Apple guideline 5.1.1(v) requires revoking user tokens through the SIWA REST API. It then drops every Better Auth row keyed to the user (`session`, `account`, `twoFactor`, `oauthAccessToken`, `oauthConsent`, `oauthApplication`, `verification`) and deletes the Better Auth user. Deleting that user fires the `onDelete` trigger, which drops the app `users` row and frees the avatar blob. Then it writes an audit row.
- `accountDeletionAudit` is the compliance trail. One row per transition (`requested`, `restored`, `permanent`) keyed on `authId`, so you can reconstruct the lifecycle after the user row is purged.

### Convex deploy keys

- The production deploy key lives in EAS env at `secret` visibility, and `deploy_convex` pulls it via `environment: production`. It's never inlined in YAML or logs.
- `vexpo apple eas-rotation-secrets` pushes the full set once (`APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`). Re-running overwrites without prompting.

### CI

- `.github/workflows/check.yml` declares `permissions: contents: read`, which narrows GitHub Actions' broad default to read-only.
- `.github/workflows/release.yml` is the only workflow with `contents: write` (for the release, plus `id-token: write` for npm provenance). Tag push triggers it, no PR can. `scorecard.yml` elevates to `security-events: write` plus `id-token: write` to sign its results upload. `codeql.yml` elevates to `security-events: write` only. Neither touches repo content.
- `npm ci` on every install (frozen lockfile), so a PR changing a transitive dep version can't sneak through.

### Developer machine compromise

- `.setup-state.json` holds IDs and timestamps, no secrets. The Convex deployment name and Apple Team ID alone don't authenticate as the developer.
- `.env.local` and `.env.prod` DO contain secrets. Both are `.gitignored`, so manage them like any local credentials.
- `.p8` files (ASC API, SIWA) are private keys, also `.gitignored`. Stage the one-time downloads in the `credentials/` dir. The real copy lives on EAS, uploaded and KMS-encrypted, so delete the local SIWA `.p8` once it's pushed. The ASC key stays, since `eas.json`'s submit profiles point at its path and CLI submits read it from there.

## Secret rotation

Here is every secret the template holds, how often to rotate it, and what does the rotating.

| Secret                         | Rotation cadence          | How                                                                                                                                      |
| ------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Apple SIWA `client_secret` JWT | Every 90 days             | Automated via `rotate-apple-jwt.yml` EAS Workflow cron                                                                                   |
| Convex production deploy key   | When suspected compromise | `npx convex auth` → revoke + reissue                                                                                                     |
| Apple distribution cert        | Annual (Apple's choice)   | `eas credentials -p ios` interactive flow                                                                                                |
| Apple APNs push key            | When suspected compromise | Apple Developer Portal → Keys → Revoke + Create                                                                                          |
| ASC API key                    | Every 6 to 12 months      | App Store Connect → Users and Access → Integrations → Revoke + Create (Team key, App Manager role, no in-place edit)                     |
| `BETTER_AUTH_SECRET`           | When suspected compromise | Rotate with the versioned `BETTER_AUTH_SECRETS=2:new,1:old` form so live sessions survive. Never swap the singular secret mid OAuth flow |
| `EAS_WEBHOOK_SECRET`           | When suspected compromise | `npx eas-cli webhook:update --id <id> --secret <new>` + `npx convex env set EAS_WEBHOOK_SECRET <new>`                                    |
| `RESEND_WEBHOOK_SECRET`        | When suspected compromise | Resend dashboard → reissue + `npx convex env set RESEND_WEBHOOK_SECRET <new>`                                                            |
