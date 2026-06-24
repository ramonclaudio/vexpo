# Security

Threat model, the defenses vexpo ships, and what's out of scope. If you operate a vexpo-derived production app, this is the surface to think about.

## Threat model

What vexpo's surface is positioned to defend against:

1. Forged inbound webhooks. Anyone who learns a webhook URL can otherwise POST whatever they want.
2. Replayed inbound webhooks. An attacker captures a legitimate webhook and replays it later.
3. Stolen OTA bundles. A compromised CDN serves a malicious JS bundle.
4. Stolen Apple credentials. APNs `.p8`, SIWA `.p8`, distribution certs.
5. Stolen Convex deploy keys. Lets an attacker push code to your deployment.
6. Stale Apple Sign In JWTs. Apple caps `client_secret` JWTs at 180 days. An expired one silently breaks every new sign-in.
7. Compromised CI runners. Workflow steps run with broad token scope by default.
8. Token theft from `.setup-state.json`. A developer's machine is compromised: what does the attacker learn?

Out of scope:

- TLS termination and cert management (Convex + EAS handle it).
- DDoS protection on Convex's HTTP routes (Convex's CDN handles the first tier).
- Per-endpoint auth rate-limit tuning. `@convex-dev/rate-limiter` is wired, but tuning is the operator's call.
- Forensics / SIEM. We log structured events, not full request bodies.

## Defenses, by surface

### Inbound webhooks (EAS, Resend, future Stripe / GitHub)

The `convex/webhook.ts` factory wraps every signed POST handler with:

- Constant-time HMAC verification, per the algorithm the source declares (EAS SHA-1, Stripe SHA-256). Mismatch returns 401 with a request ID, no body details.
- Body size cap, default 1 MiB, rejected before parsing JSON. Defends against memory-exhaustion uploads.
- Optional replay window. Source-dependent. EAS doesn't sign a timestamp, Stripe does. When opted in, the factory checks `|now - t| < maxAgeSeconds`.
- Per-request correlation ID, returned as `X-Request-Id` and logged on every line.
- Structured access log: `webhook.ok`, `webhook.bad_signature`, `webhook.too_large`, `webhook.stale`, `webhook.handler_error`, one-line JSON to Convex's log surface.
- No secret echo. Error responses carry the request ID, never the body, signature, or secret name.

Better Auth routes (`authComponent.registerRoutesLazy`) handle their own CSRF + session protection per Better Auth's spec.

### OTA updates

- `runtimeVersion: { policy: "fingerprint" }`. A native change auto-bumps the hash, so an OTA can never load against an incompatible binary, no manual version discipline. `@expo/fingerprint >= 0.19.3` makes the policy deterministic across machines and CI by default, so the template needs no `fingerprint.config.js` and no jsi `.fingerprintignore` entry. Native version bumps still flip the fingerprint via `package.json` + the `expoAutolinkingConfig:ios` JSON.
- End-to-end code signing is wired. `app.config.ts` detects `certs/certificate.pem` at config-eval time and turns on `codeSigningCertificate` / `codeSigningMetadata`. `deploy-production.yml`'s `update_ios` job passes `private_key_path: "$EAS_UPDATE_PRIVATE_KEY"` so `eas update` signs locally before publish. Two one-time steps activate it:
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

  After that, every bundle is signed during `eas update` and verified on-device against the bundled cert before install. A compromised CDN or EAS account cannot ship arbitrary JS. If the env var is unset, `eas update` skips signing without erroring.

- Gradual rollouts. `rollout.yml` publishes at controlled percentages (5% → 25% → 100%). A broken update reaches a fraction of users.
- Rollback workflows. `rollback.yml` runs `update:republish` or `update:roll-back-to-embedded` non-interactively.

### Apple credentials

- `.p8` keys never land in committed files. Template `.gitignore` matches Apple's default download names (`AuthKey_*`, `SubscriptionKey_*`, `*.p8`). The state cache stores only paths, never contents.
- SIWA JWT rotation runs on EAS, not GitHub. `rotate-apple-jwt.yml` cron fires `0 12 1 */3 *`. Reads `APPLE_P8_PRIVATE_KEY` etc. from EAS env at `secret` visibility, never logged.
- Managed credentials only. EAS holds the dist cert + provisioning profile + push key. `vexpo apple credentials` passes the cached ASC key to `eas credentials:configure-build` via env vars. The credentials never leave EAS.
- ASC API key validation. `vexpo apple asc-key` calls `GET /v1/apps` and rejects anything other than 200, so a key that authenticates but lacks capabilities is caught at validation time, not submit time.

### Account deletion

Apple App Store Review 5.1.1(v) requires in-app account deletion. vexpo ships a soft-delete + 30-day window:

- `users.deleteAccount` tombstones, doesn't purge. Sets `deletedAt: Date.now()`, drops every Better Auth session (device signs out) and push token (notifications stop). Credentials, account rows, and Apple links survive the window.
- `users.restoreAccount` lifts the tombstone. A user who signs back in within 30 days sees `getMe` return a row with `deletedAt` set, so route them to a restore-or-continue surface and call `restoreAccount`.
- `internal.users.hardDeleteExpired` cron runs daily at 04:00 UTC. For each row past the window it revokes Apple Sign In refresh tokens (Apple guideline 5.1.1(v) requires the SIWA REST API to revoke user tokens), drops every Better Auth row keyed to the user (`session`, `account`, `twoFactor`, `oauthAccessToken`, `oauthConsent`, `oauthApplication`, `verification`), deletes the Better Auth user (the `onDelete` trigger drops the app `users` row and frees the avatar blob), and writes an audit row.
- `accountDeletionAudit` is the compliance trail. One row per transition (`requested`, `restored`, `permanent`) keyed on `authId`, so the lifecycle is reconstructable after the user row is purged.

### App Attest

App Attest ships as primitives ready to wire, not a live flow. The goal is cryptographic proof that a request came from an unmodified vexpo binary on a real iOS device with a Secure Enclave. Rate limiting slows attackers. App Attest proves the device is real. Two pieces:

- Server verifiers in `convex/appAttest.ts` (`issueChallenge`, `verifyAttestation`, `verifyAssertion`), all `internalAction` so the client can't call them yet. `verifyAttestation` runs Apple's full protocol: verifies the cert chain from `x5c[0]` to the pinned Apple App Attest Root CA, recomputes the nonce and matches the leaf cert's `1.2.840.113635.100.8.2` extension, checks the public-key hash against `credentialId`, verifies `rpIdHash == SHA256(<TEAM_ID>.<BUNDLE_ID>)` and the AAGUID for the environment, and that the initial counter is zero. `verifyAssertion` checks the ECDSA-P256-SHA256 signature against the stored key and bumps a strictly-increasing counter in one mutation. `appAttestChallenges` is single-use + TTL'd (5 min), swept hourly.
- Client helper in `src/lib/appAttest.ts` (`attestThisDevice`, `signRequest`) drives `@expo/app-integrity` against an `AppAttestClient` the caller provides.

To wire it: expose a public action over the `internalAction` verifiers, implement `AppAttestClient` to call it, then guard the anti-abuse surfaces by verifying `X-App-Attest-KeyId` + `X-App-Attest-Assertion` + the body. The iOS entitlement (`com.apple.developer.devicecheck.appattest-environment: production`) lives in `app.config.ts`'s `ios.entitlements`. Debug builds attest against the development AAGUID automatically.

https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server

### Convex deploy keys

- Production deploy key lives in EAS env at `secret` visibility. `deploy_convex` pulls it via `environment: production`. Never inlined in YAML or logs.
- `vexpo apple eas-rotation-secrets` pushes the full set once: `APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`. Re-running overwrites without prompting.

### CI

- `.github/workflows/check.yml` declares `permissions: contents: read`. We narrow GitHub Actions' broad default to read-only.
- `.github/workflows/release.yml` is the only workflow requesting write scopes (`contents: write` for the release, `id-token: write` for npm provenance). Tag push triggers it, no PR can.
- `npm ci` on every install (frozen lockfile), so a PR changing a transitive dep version can't sneak through.

### Developer machine compromise

- `.setup-state.json`: IDs and timestamps, no secrets. The Convex deployment name and Apple Team ID alone don't authenticate as the developer.
- `.env.local`, `.env.prod`: these DO contain secrets. `.gitignored`. Manage like any local credentials.
- `.p8` files: private keys. `.gitignored`. Live outside the repo (suggested: `~/Library/Application Support/vexpo/keys/`).

## Secret rotation

| Secret                         | Rotation cadence          | How                                                                                               |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Apple SIWA `client_secret` JWT | Every 90 days             | Automated via `rotate-apple-jwt.yml` EAS Workflow cron                                            |
| Convex production deploy key   | When suspected compromise | `npx convex auth` → revoke + reissue                                                              |
| Apple distribution cert        | Annual (Apple's choice)   | `eas credentials -p ios` interactive flow                                                         |
| Apple APNs push key            | When suspected compromise | Apple Developer Portal → Keys → Revoke + Create                                                   |
| ASC API key                    | When suspected compromise | App Store Connect → Users and Access → Keys → Revoke + Create                                     |
| `EAS_WEBHOOK_SECRET`           | When suspected compromise | `npx eas webhook:update --id <id> --secret <new>` + `npx convex env set EAS_WEBHOOK_SECRET <new>` |
| `RESEND_WEBHOOK_SECRET`        | When suspected compromise | Resend dashboard → reissue + `npx convex env set RESEND_WEBHOOK_SECRET <new>`                     |

The SIWA JWT is the only one with automated rotation, because it's the only one Apple's API will sign on our behalf. The rest require human-in-the-loop rotation by Apple's design.

## Reporting issues

For vulnerabilities in vexpo's own code, open a private security advisory: `https://github.com/ramonclaudio/vexpo/security/advisories/new`. Please don't file public issues.

For vulnerabilities in dependencies (Expo, Convex, Better Auth, Resend), report upstream first per their disclosure policies. We'll bump the affected dependency and ship a patched release once upstream has a fix.
