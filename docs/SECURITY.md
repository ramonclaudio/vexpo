# Security

Threat model, the defenses vexpo ships, and what's explicitly out of scope. If you're operating a vexpo-derived production app, this is the surface you need to think about.

## Threat model

The attacks vexpo's surface is positioned to defend against:

1. **Forged inbound webhooks.** Anyone who guesses or learns a webhook URL can otherwise POST whatever they want.
2. **Replayed inbound webhooks.** An attacker who captures a legitimate webhook in transit and replays it later.
3. **Stolen OTA bundles.** A compromised CDN serves a malicious JS bundle.
4. **Stolen Apple credentials.** APNs `.p8`, SIWA `.p8`, distribution certs.
5. **Stolen Convex deploy keys.** Lets an attacker push code to your Convex deployment.
6. **Stale Apple Sign In JWTs.** Apple caps `client_secret` JWTs at 180 days. An expired JWT silently breaks every new Sign-in until rotated.
7. **Compromised CI runners.** Workflow steps run with broad token scope by default.
8. **Token theft from `.setup-state.json`.** A developer's machine is compromised. What does the attacker learn?

What's explicitly **out of scope:**

- TLS termination and certificate management (Convex + EAS handle this).
- DDoS protection on Convex's HTTP routes (Convex's CDN handles the first tier).
- App-level rate limiting on auth flows is partial. `@convex-dev/rate-limiter` is wired but per-endpoint tuning is the operator's call.
- Forensics / SIEM. We log structured events, not full request bodies.

## Defenses, by surface

### Inbound webhooks (EAS, Resend, future Stripe / GitHub)

The `convex/webhook.ts` factory wraps every signed POST handler with:

- **Constant-time HMAC verification.** Per the algorithm declared by the source (EAS uses SHA-1, Stripe uses SHA-256). Mismatch returns 401 with a request ID, no body details.
- **Body size cap.** Default 1 MiB, configurable. Reject before parsing JSON. Defends against memory-exhaustion runaway uploads.
- **Optional replay window.** Source-dependent. EAS doesn't sign a timestamp. Stripe does. When opted in, the factory checks `|now - t| < maxAgeSeconds` so a captured webhook can't be replayed hours later.
- **Per-request correlation ID.** Returned as `X-Request-Id` and logged on every line so a single forged request is traceable end-to-end.
- **Structured access log.** `webhook.ok`, `webhook.bad_signature`, `webhook.too_large`, `webhook.stale`, `webhook.handler_error` events emit one-line JSON to Convex's log surface, which you can query directly.
- **No secret echo.** Error responses include the request ID but never echo the request body, signature, or secret name.

The Better Auth routes (registered via `authComponent.registerRoutesLazy`) handle their own CSRF + session protection per Better Auth's spec.

### OTA updates

- **`runtimeVersion: { policy: "fingerprint" }`.** A native change automatically forces a fresh build because the hash auto-bumps. OTAs can never load against an incompatible binary, no manual version-bump discipline required. Two upstream-non-determinism workarounds make the policy stable on this stack: `fingerprint.config.js` sets `useRNCoreAutolinkingFromExpo: false` (so reanimated/worklets hash via the autolinker's JSON output rather than per-directory), and `.fingerprintignore` excludes `node_modules/expo-modules-jsi/apple/**` (skips the pod-install-stamped `Products/` stubs). Real version bumps still flip the fingerprint via package.json + the `expoAutolinkingConfig:ios` JSON, so safety holds.
- **End-to-end code signing is wired.** `app.config.ts` detects `certs/certificate.pem` at config-eval time and turns on `codeSigningCertificate` / `codeSigningMetadata` automatically. `.eas/workflows/deploy-production.yml`'s `update_ios` job passes `private_key_path: "$EAS_UPDATE_PRIVATE_KEY"` so `eas update` signs locally before publish. Two one-time steps activate it:
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

  Once both are in place, every OTA bundle is signed with the private key during `eas update` and verified on-device against the bundled certificate before install. A compromised CDN or EAS account cannot ship arbitrary JS. If the env var is unset (cert not yet generated), `eas update` skips signing without erroring.

- **Gradual rollouts.** `rollout.yml` workflow publishes new updates at controlled percentages (5% → 25% → 100%). A broken update reaches a fraction of users, not all of them.
- **Rollback workflows.** `rollback.yml` runs `update:republish` or `update:roll-back-to-embedded` non-interactively in CI.

### Apple credentials

- **`.p8` keys never land in committed files.** Template `.gitignore` matches Apple's default download filenames (`AuthKey_*`, `SubscriptionKey_*`, `*.p8`) so an accidentally-moved file can't sneak in. The CLI's state cache (`.setup-state.json`) stores only paths, never contents.
- **SIWA JWT rotation runs on EAS, not GitHub.** `.eas/workflows/rotate-apple-jwt.yml` cron fires `0 12 1 */3 *` (every three months at noon UTC). Reads `APPLE_P8_PRIVATE_KEY` etc. from EAS env at `secret` visibility, never logged, never echoed.
- **Managed credentials only.** EAS holds the distribution cert + provisioning profile + push key. `vexpo apple credentials` passes the cached ASC API key to `eas credentials:configure-build` via env vars so the wizard skips the Apple Developer login prompt, but the credentials themselves never leave EAS.
- **ASC API key validation.** `vexpo apple asc-key` calls `GET /v1/apps` with the supplied key and rejects if Apple returns anything other than 200. A key that authenticates but lacks the right capabilities is caught at validation time, not at submit time.

### Account deletion

Apple App Store Review 5.1.1(v) requires apps that let users create accounts to also let them delete those accounts from within the app. vexpo ships a soft-delete + 30-day window:

- **`users.deleteAccount` tombstones, doesn't purge.** Patches the user row with `deletedAt: Date.now()`, drops every Better Auth session so the device signs out, and drops push tokens so notifications stop. Credentials, account rows, Apple links all stay intact during the window.
- **`users.restoreAccount` lifts the tombstone.** A user who signs back in within 30 days sees their `getMe` query return a row with `deletedAt` set; the client can route them to a "restore or continue with deletion" surface and call `restoreAccount` to undo.
- **`internal.users.hardDeleteExpired` cron runs daily at 04:00 UTC.** Walks `users.by_deletedAt` in bounded batches, and for each row past the window irreversibly:
  1. Revokes Apple Sign In refresh tokens via `internal.apple.revokeRefreshToken` (per Apple guideline 5.1.1(v): "you revoke the associated tokens when they delete their account")
  2. Drops every Better Auth row keyed to the user (`session`, `account`, `twoFactor`, `oauthAccessToken`, `oauthConsent`, `oauthApplication`, `verification`)
  3. Deletes the Better Auth user, which fires the `onDelete` trigger that drops the app `users` row and frees the avatar blob
  4. Writes an audit row to `accountDeletionAudit`
- **`accountDeletionAudit` is the compliance trail.** One row per state transition (`requested`, `restored`, `permanent`) keyed on `authId` so the lifecycle is reconstructable after the user row is purged.

### App Attest

`@expo/app-integrity` + `convex/appAttest.ts` provide end-to-end cryptographic proof that an incoming request originated from an unmodified vexpo binary running on a real iOS device with a Secure Enclave. Rate limiting still slows attackers; App Attest proves they came from a real device.

Protocol (per Apple's "Validating Apps That Connect to Your Server"):

1. **Attestation (one-time per device).**
   - Client calls `attestThisDevice(client)` in `lib/appAttest.ts`. The server's `internal.appAttest.issueChallenge` returns a single-use nonce TTL'd for 5 minutes.
   - `generateKeyAsync()` creates a Secure-Enclave key. `attestKeyAsync(keyId, nonce)` produces a CBOR attestation.
   - `internal.appAttest.verifyAttestation` walks every step of Apple's protocol: verifies the cert chain from `x5c[0]` through the intermediate to the pinned Apple App Attest Root CA, recomputes the nonce as `SHA256(authData || SHA256(challenge))` and matches it against the leaf cert's `1.2.840.113635.100.8.2` extension, hashes the leaf's public key and compares against the `credentialId` portion of `authData`, verifies the `rpIdHash` matches `SHA256(<TEAM_ID>.<BUNDLE_ID>)`, verifies the AAGUID matches the deployment environment, and verifies the initial counter is zero.
   - On success the public key + counter are recorded in `appAttestKeys` keyed on `keyId`.

2. **Assertion (per signed request).**
   - Client calls `signRequest(client, keyId, payload)`. The server issues a fresh challenge, the device produces an assertion, and `internal.appAttest.verifyAssertion` verifies the ECDSA-P256-SHA256 signature over `SHA256(authenticatorData || SHA256(payload))` using the stored public key.
   - The counter must strictly increase. The bump runs in a single mutation so two concurrent assertions can't both win.

3. **Replay protection.** `appAttestChallenges` is single-use + TTL'd. The hourly cron `internal.appAttestStore.cleanupChallenges` sweeps expired rows.

The iOS entitlement (`com.apple.developer.devicecheck.appattest-environment: production`) lives in `app.config.ts`'s `ios.entitlements`. Debug builds with Xcode attached automatically attest against the development AAGUID, so the same entitlement value works across paths.

App Attest is not enforced on every mutation by default. It's a primitive to compose into the surfaces that care about anti-abuse. Wrap a Convex `httpAction` or `mutation` with a require-attestation guard that calls `internal.appAttest.verifyAssertion` against `X-App-Attest-KeyId` + `X-App-Attest-Assertion` + the request body, and reject when verification throws.

https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server

### Convex deploy keys

- **Production deploy key lives in EAS env at `secret` visibility.** The `deploy_convex` job in `deploy-production.yml` pulls it via `environment: production`. Never inlined in YAML, never in workflow logs.
- **`vexpo apple eas-rotation-secrets` pushes the full secret set.** Run once after creating each: `APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`. Idempotent: re-running overwrites without prompting.

### CI

- The root `.github/workflows/check.yml` declares `permissions: contents: read` explicitly. Default GitHub Actions permissions are broad. We narrow to read-only.
- The release workflow (`.github/workflows/release.yml`) is the only workflow requesting write scopes (`contents: write` for the GitHub release, `id-token: write` for npm provenance). Tag push triggers it, no PR can.
- `--frozen-lockfile` on every install step. A PR that changes a transitive dep version doesn't sneak through.

### Developer machine compromise

If a developer's machine is taken, what does the attacker learn?

- **`.setup-state.json`**: IDs and timestamps. No secrets. They can see the project's Convex deployment name and Apple Team ID, but those alone don't authenticate as the developer.
- **`.env.local`, `.env.prod`**: these DO contain secrets. `.gitignored`. Developer is expected to manage the same way they'd manage any local credentials.
- **`.p8` files**: these DO contain private keys. `.gitignored`. Live outside the repo (suggested location: `~/Library/Application Support/vexpo/keys/`).

## Secret rotation

| Secret                         | Rotation cadence          | How                                                                                                 |
| ------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------- |
| Apple SIWA `client_secret` JWT | Every 90 days             | Automated via `rotate-apple-jwt.yml` EAS Workflow cron                                              |
| Convex production deploy key   | When suspected compromise | `npx convex auth` → revoke + reissue                                                               |
| Apple distribution cert        | Annual (Apple's choice)   | `eas credentials -p ios` interactive flow                                                           |
| Apple APNs push key            | When suspected compromise | Apple Developer Portal → Keys → Revoke + Create                                                     |
| ASC API key                    | When suspected compromise | App Store Connect → Users and Access → Keys → Revoke + Create                                       |
| `EAS_WEBHOOK_SECRET`           | When suspected compromise | `npx eas webhook:update --id <id> --secret <new>` + `npx convex env set EAS_WEBHOOK_SECRET <new>` |
| `RESEND_WEBHOOK_SECRET`        | When suspected compromise | Resend dashboard → reissue + `npx convex env set RESEND_WEBHOOK_SECRET <new>`                      |

The Apple SIWA JWT is the only one with automated rotation because it's the only one Apple's API will sign on our behalf. The others require human-in-the-loop rotation by Apple's design.

## Reporting issues

For vulnerabilities in vexpo's own code, open a private security advisory on GitHub: `https://github.com/ramonclaudio/vexpo/security/advisories/new`. Please don't file public issues.

For vulnerabilities in dependencies (Expo, Convex, Better Auth, Resend), report upstream first per their disclosure policies. We'll bump the affected dependency and ship a patched release once upstream has a fix or workaround.
