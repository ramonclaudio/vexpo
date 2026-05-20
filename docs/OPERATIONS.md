# Operations

On-call runbook for a vexpo-derived production app. Read this before something breaks at 2am, not at 2am.

## Service map

```
End user                                      Internal
   │                                             │
   ▼                                             ▼
┌────────┐    ┌───────────────────┐    ┌──────────────────┐
│ iOS    │───▶│  Convex backend   │◀───│ EAS Build / OTA  │
│ binary │    │  - queries        │    │ - per-fingerprint│
│        │    │  - mutations      │    │   build cache    │
│ OTA  ◀─┼────│  - HTTP router    │    │ - branch/channel │
│ JS     │    │  - cron jobs      │    │   rollouts       │
│ bundle │    │  - storage        │    └──────────────────┘
└────────┘    └───────────────────┘             │
   │                  │   ▲                     │
   │                  │   │                     │
   │                  ▼   │                     │
   │            ┌──────────────┐                │
   │            │ Resend SMTP  │                │
   │            │ + webhook    │                │
   │            └──────────────┘                │
   │                                            ▼
   ▼                                  ┌──────────────────┐
┌────────┐                            │ App Store Connect│
│ APNs   │                            │ - submission     │
│ push   │◀───────────────────────────│ - review state   │
└────────┘                            │ - metadata sync  │
                                      └──────────────────┘
```

External dependencies, ordered by blast radius if down:

1. **Convex**: backend offline = app is read-only-from-cache. Hard outage.
2. **APNs**: push delivery fails silently. Not user-visible until users notice missing notifications.
3. **Apple Developer Portal / ASC API**: ships break (build, submit). Existing app keeps running.
4. **EAS Build / Update / Submit**: same as ASC. Existing app keeps running.
5. **Resend**: auth flows break (signup OTP, password reset). Sign-in via existing session keeps working.
6. **GitHub**: CI/CD blocked. Production unaffected.

## Daily checks

If you check anything every morning:

- **EAS Dashboard → Deployments.** Adoption % per update group should ramp predictably. A flat curve at the rollout % means users aren't reaching the update, almost always a runtime version mismatch or a bad rollout.
- **EAS Dashboard → Workflows.** Failed workflows on the main branch are an emergency. Failed workflows on feature branches are usually a PR author's problem.
- **Convex Dashboard → Functions.** P95 latency creep on `users:getCurrentUser`, `sessions:list`, and the HTTP routes is the early warning for everything else.
- **App Store Connect → TestFlight → Crashes.** TestFlight crash uploads land here. `asc-events.yml` should already have Slack-notified you, but verify the Slack alert fired.

## Failure modes

### Slack alert: `App version state changed to rejected`

App Store review rejected the submission. ASC events workflow fired. The message is from `asc-events.yml`'s `notify_review_state` job. Open App Store Connect, read the reviewer note, fix the issue, resubmit.

If the reviewer's note mentions a runtime crash, check Crashlytics / TestFlight feedback first. Review crashes are usually from a stale TestFlight build that's running ancient code.

### Slack alert: `TestFlight crash reported`

`asc-events.yml`'s `notify_crash` job fires when an external tester reports a crash. The feedback panel in App Store Connect has the stack trace.

Common patterns:

- **Update rolled out to wrong runtime version.** Roll back via `.eas/workflows/rollback.yml` with `embedded`. Then investigate.
- **Native code change shipped without a build bump.** Fingerprint should have caught this. Check `eas build:list --platform ios --status finished --limit 5` and confirm the running binary's fingerprint matches the published update.

### `eas update` succeeds but devices don't pick up the new bundle

Check, in order:

1. **Runtime version mismatch.** `eas update:view <groupId>` shows the runtime version. The installed binary's runtime version (visible at `/debug` in the app) must match.
2. **Channel mismatch.** The update was published to a branch the device isn't subscribed to. Verify the build profile in `eas.json` references the same `channel:` the update targeted.
3. **Code-signing mismatch.** If you enabled code-signing per the staged config in `app.config.ts` but the binary was built before that, devices reject the update silently. Look in `Updates.readLogEntriesAsync()` output (surfaced on the `/debug` screen) for `UpdateAssetsLoadError`.
4. **Stuck rollout.** `eas update:view <groupId>` shows `rolloutPercentage`. Bump via `rollout.yml` or `update:edit --rollout-percentage 100`.

### Apple Sign In stops working overnight

The SIWA `client_secret` JWT expired. Apple caps it at 180 days. vexpo rotates every 90 via `.eas/workflows/rotate-apple-jwt.yml` cron. If the cron didn't fire:

1. Open EAS Dashboard → Workflows → Rotate Apple Sign In JWT. Look for the last successful run timestamp.
2. If older than 180 days: trigger manually via `npx eas workflow:run .eas/workflows/rotate-apple-jwt.yml`.
3. If the manual trigger also fails: the `APPLE_P8_PRIVATE_KEY` or `APPLE_TEAM_ID` EAS env vars are stale. Re-push with `npx vexpo apple eas-rotation-secrets`.

### `convex deploy` fails with "deploy key invalid"

The production deploy key was rotated externally or revoked. Get a fresh one from the Convex dashboard → Settings → Deploy keys → Generate new. Push to EAS env:

```bash
npx eas env:create --name CONVEX_DEPLOY_KEY \
  --value "<new>" --environment production --visibility secret
```

Or via `npx vexpo apple eas-rotation-secrets` which prompts for the deploy key interactively.

### Resend webhook delivery events stop landing

Check `/resend-webhook` errors in Convex logs. Common patterns:

- **Signature mismatch.** `RESEND_WEBHOOK_SECRET` Convex env var diverged from the Resend dashboard config. Sync.
- **Resend's webhook target URL is stale.** A Convex deployment URL change (project rename, deployment switch) invalidates the webhook target. Re-create the webhook on the Resend side with the new `https://<deployment>.convex.site/resend-webhook`.

### `/eas-webhook` errors in Convex logs

Filter on `event:"webhook.bad_signature"`. Common causes:

- `EAS_WEBHOOK_SECRET` Convex env var doesn't match what was supplied to `eas webhook:create`. Reissue both sides:
  ```bash
  npx eas webhook:update --id <id> --secret <new>
  npx convex env set EAS_WEBHOOK_SECRET <new>
  ```
- A different EAS project is sending to your webhook URL by mistake. Confirm via `npx eas webhook:list`.

### Convex function p95 spike

The Convex dashboard shows per-function p50/p95/p99. If `users:listUsers` or `sessions:list` is creeping past 100ms, check:

- **Table size.** Convex indexes are good but unindexed scans get linear in row count. The `.index("by_authId", ["authId"])` on the `users` table covers `getCurrentUser`. New queries need new indexes.
- **Auth fan-out.** `authComponent.getAnyUserById` resolves the Better Auth user. Running it inside a `Promise.all` over hundreds of rows can balloon. Batch via `authComponent.getAnyUsersByIds` if available, otherwise paginate.

## Useful queries

```bash
# Find the last 10 production updates with their adoption %
npx eas update:list --branch production --limit 10 --json | \
  jq '.[] | {group: .group, message, rollout: .rolloutPercentage, date: .createdAt}'

# Find OTA crash signature on a specific update group
npx eas update:view <groupId> --json | jq '.metrics'

# List all currently active EAS builds (in case one stuck the queue)
npx eas build:list --status in-progress

# Query Convex logs for failed HTTP webhook signatures in the last hour
# (paste into the Convex dashboard logs panel, narrow by time)
event:"webhook.bad_signature"

# Verify the Apple SIWA JWT cron's last fire was within 90 days
npx eas workflow:runs --workflow rotate-apple-jwt.yml --limit 5
```

## Logs

Every `convex/http.ts` handler emits one-line JSON via `convex/log.ts`. Searchable in Convex's dashboard. Fields:

- `event`: dot-namespaced verb (`webhook.ok`, `aasa.served`, `webhook.bad_signature`)
- `requestId`: correlates all log lines for a single inbound request
- `durationMs`: handler timing
- `source`: webhook source name (`eas-webhook`, `resend-webhook`)
- `level`: `info`, `warn`, `error`

To trace a single user-reported issue: ask the user for the `X-Request-Id` response header (visible in network inspector), then filter logs on that ID.

## When to call a human

vexpo isn't fully self-healing. The cases where you need to wake someone up:

- **All inbound traffic to Convex is failing.** Check Convex's status page, then escalate to Convex support.
- **EAS Workflows are stuck for hours with no new runs starting.** Check EAS's status page.
- **TestFlight build upload fails repeatedly with a non-actionable error.** EAS support.
- **App is removed from sale.** App Store Connect → Pricing and Availability. Escalate to App Review support.

For everything else, the playbook above should get you to the root cause within an hour.
