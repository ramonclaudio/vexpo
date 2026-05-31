# Changelog

All notable changes to vexpo are tracked here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-31

Patch release for the `@ramonclaudio/vexpo` CLI. `@ramonclaudio/create-vexpo` republishes in lockstep with no functional change.

- `vexpo sandbox` degrades gracefully when Apple 404s the sandbox testers API: a plain pointer to App Store Connect instead of a raw `ASC 404 PATH_ERROR`. `list` exits 0.
- `vexpo doctor` resend webhook check now names the wrong-Resend-account case (webhooks exist for other `convex.site` deployments but not this one) instead of reporting a missing webhook.

## [0.1.0] - 2026-05-11

First public release.

- `@ramonclaudio/create-vexpo@0.1.0`: npm scaffolder. `npm create @ramonclaudio/vexpo@latest my-app` copies the template, rewrites `package.json`, runs install, inits git.
- `@ramonclaudio/vexpo@0.1.0`: operational CLI. Two-mode setup (`lite` for 60-second simulator, `full` for TestFlight-ready), cross-source drift detection (`doctor`), Apple SIWA work (`apple jwt`, `apple services-id`, `apple credentials`, `apple eas-rotation-secrets`), App Store Connect API endpoints `eas-cli` doesn't expose (`testflight`, `reviews`, `sandbox`, `asc:version`, `asc:submissions`), and multi-destination env sync (`env push`).
- `templates/default/`: production-ready Expo SDK 56 + Convex + Better Auth + Resend iOS app. Native SwiftUI via `@expo/ui/swift-ui`, Apple Sign In, APNs push, Universal Links, profile + sessions, HMAC-verified webhook factory, 10 EAS Workflows covering dev builds, PR previews, deploy on main, TestFlight, rollback, rollout, ASC events, JWT rotation cron.
- 277 tests (238 vexpo unit + 29 template + 10 e2e).

See [`README.md`](./README.md) for the feature list, [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the trade-off log, [`docs/SECURITY.md`](./docs/SECURITY.md) for the threat model, [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) for the on-call runbook, and [`docs/UPSTREAM.md`](./docs/UPSTREAM.md) for the ledger of every upstream PR we shipped to `expo/expo` that the template depends on.

[0.1.1]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.1
[0.1.0]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.0
