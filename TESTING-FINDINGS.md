# E2E testing findings — June 11, 2026

Full golden-path + from-scratch `full` verification run the night before the Phil interview. Everything below was witnessed live, not inferred.

## Verified working end to end

- `npm create @ramonclaudio/vexpo@latest` from the public registry: scaffold, install, git init, 113/113 template tests, typecheck, lint.
- `vexpo lite` interactive: Convex provisioned in ~23s, Better Auth set, idempotent resume after interrupt, `setup complete in 14.68s` on the resumed run.
- `expo run:ios`: build, install, launch on iPhone 17 Pro simulator. Real sign-up through Better Auth, auto-verified (lite), live session on home screen.
- `vexpo full` idempotent re-run on a provisioned project (templates/default): cache skips, live re-verification of Convex/Resend/Apple/EAS, `eas login` recovery mid-run, final no-op pass "everything is configured, nothing to do" exit 0.
- `vexpo full` from scratch on a fresh app (phil-demo): rebrand via flags under pty, full-scope Convex (+ team id), Resend real provisioning (scoped key, webhook, EMAIL_FROM, REQUIRE_EMAIL_VERIFICATION=true flip), review-account seed, EAS project creation + channels + env push, ASC key live validation, EAS iOS credentials (cert reuse + new provisioning profile) to "All credentials are ready to build".
- `doctor` in three states: empty dir (graceful), lite project (7 ok / 2 expected warn / 4 lite-mode skips), fully provisioned (22 ok live checks).
- `--plan` and `--dry-run`: accurate, honest about human gates.

## Fixed on branch fix/lite-optional-team-id

1. `lite` hard-failed on empty Apple Team id in a TTY, violating its own "no Apple account" contract. Now skips (5 new tests, 353/353).
2. Template deps 17 patches behind → `expo-doctor` failed on fresh scaffolds. Bumped, 21/21.
3. README documented nonexistent `vexpo setup`; package README contradicted `asc:connect`'s existence; 4 commands undocumented. Fixed.
4. `create-vexpo` accepted `@scope/pkg` and nested into `@scope/`. Now rejected.

## Open findings (not yet fixed)

5. `rebrand` with ALL identity flags + `--yes` still demands a TTY ("rebrand wizard needs a TTY"), contradicting its own non-TTY error message that lists required flags. Flags+--yes should be fully non-interactive.
6. `rebrand` does not reconcile `.env.local` / Convex env `APP_BUNDLE_ID` when run AFTER lite: app.config.ts gets the new bundle id, env keeps the old one, and the convex step nop's ("already set") instead of detecting the mismatch. Real drift, the exact class doctor catches. Reconciled manually for phil-demo.
7. `apple asc-key` has no non-interactive path at all: no flags, no env, refuses piped stdin ("no credentials provided"). Workaround: seed `.setup-state.json`; the live check still validates against Apple.
8. `asc:connect` on a brand-new bundle fails with eas-cli's raw "Found 0 app(s)" error. No ASC app record exists until first `eas submit` (vexpo's own EAS section prints this). The step should detect 0-apps for a fresh bundle and defer with guidance instead of exiting 1.
9. UX nit: "rotate the JWT now? [Y/n]" defaults to Y with a healthy (141-day) JWT.
10. UX nit: lite signup screen subtitle says "A verification code will be sent" even when REQUIRE_EMAIL_VERIFICATION=false.
11. Probe label nit: ".env.local missing" in full scope when the file exists with lite keys. Scope-aware probes are right; the label is misleading ("partial (lite)" would be honest).

## Not tested (by design, human gates)

- Fresh ASC API key creation, SIWA key creation, Services ID portal walkthrough, Resend DNS records: all require Apple/registrar web UI. The `--plan` output documents them accurately (~30 min active time).
- `eas build` / `eas submit` / TestFlight: costs build credits, creates ASC app record. The from-scratch phil-demo is staged ready for it (`eas build -p ios --profile production --auto-submit-with-profile testflight`).

## State created during testing (cleanup candidates)

- Convex projects: `phil-demo` (warmhearted-cow-491) on the personal team.
- EAS project: `@ramonclaudio/phil-demo` (24b17ad6-b0e7-429e-ad58-92acf51256c1).
- Apple: provisioning profile for `com.rmncldyo.phildemo` (cert reused, no new cert).
- Resend: scoped sending key `phil-demo` for rmncldyo.com.
- Demo app: `/tmp/vexpo-live-e2e/phil-demo` (working, signed-in user "Phil Demo").
