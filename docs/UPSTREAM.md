# Upstream contributions

Patches and fixes vexpo ships locally while waiting for upstream merges. Each entry has a one-line summary, the root cause as we understood it, and the link to the upstream PR.

## `@convex-dev/better-auth` PR #368

**Symptom.** `useConvexAuth().isAuthenticated` never flips to `true` after a successful sign-in on Expo SDK 56 canary (2026-05-05 or later) running on iOS with Hermes V1. The Better Auth session lands cleanly, `authClient.useSession()` reflects the new state, and `/convex/token` returns a valid JWT, but the Convex websocket stays paused. Same bug on sign-up and sign-out. Every auth state change leaves the bridge stuck.

**Root cause.** A two-call race in `@convex-dev/better-auth/src/react/index.tsx`:

1. `fetchAccessToken` resolves with the JWT and calls `setCachedToken(token)`.
2. The `/convex/token` response's `Set-Cookie` runs through Better Auth's fetch interceptor.
3. That triggers a re-render. `sessionId` updates.
4. The `[sessionId]` dep on `fetchAccessToken`'s `useCallback` rebuilds the function.
5. `ConvexAuthStateFirstEffect` sees a new `fetchAccessToken` and calls `client.setAuth` a second time.
6. Convex's `fetchTokenAndGuardAgainstRace` (`authentication_manager.ts`) bumps `configVersion` on entry. The original `await` from step 1 sees the stale value and returns `isFromOutdatedConfig: true`.
7. `setConfig` bails without `resumeSocket()`. Chain repeats forever.

The race was masked for years by an old Babel transform (`@babel/plugin-transform-async-to-generator`) that the Hermes V1 preset shipped with. The transform's `_asyncToGenerator` helper wraps the body in `new Promise(executor)` and schedules a `NewPromiseResolveThenableJob` microtask, one extra tick of delay that's enough to let the first `setAuth` complete before the second arrives. Native async returning a thenable should do the same per the ECMAScript spec, but Hermes V1's native pipeline elides that microtask. [`expo/expo#45345`](https://github.com/expo/expo/pull/45345) dropped the Babel transform on 2026-05-05, exposing the underlying race.

**Fix.** Drop the `async` keyword on `fetchAccessToken` and wrap the body in `new Promise(executor)` directly. The constructor's `resolve(thenable)` schedules the same microtask `_asyncToGenerator` provided. With the hop in place the second `setAuth` lands after the first `setConfig` finishes rather than during its await window.

48 lines changed, 26 added, 22 removed. `AuthTokenFetcher` contract preserved. `pendingTokenRef` caching, `cachedToken` state, the catch/finally, and the `[sessionId]` dependency all stay.

**Reading list.**

- The PR itself: [`get-convex/better-auth#368`](https://github.com/get-convex/better-auth/pull/368)
- Repro project: [`ramonclaudio/convex-better-auth-368-repro`](https://github.com/ramonclaudio/convex-better-auth-368-repro)
- The Expo transform removal that exposed it: [`expo/expo#45345`](https://github.com/expo/expo/pull/45345)
- Hermes's native async lowering: [`facebook/hermes` BCGen.cpp `genFastArrayLengthHelper` chain](https://github.com/facebook/hermes/tree/main/lib/BCGen/HBC/BackendContext.h). The relevant subtree is `HBCISel::generateCallInst` and the lack of a thenable-resolve microtask for native async return values.

**Ship route.** While #368 is in review, the patched build lives at `templates/default/patches/convex-dev-better-auth-0.12.2.tgz`. The template's `package.json` references it via `file:./patches/convex-dev-better-auth-0.12.2.tgz`. Once upstream merges and tags a `0.12.3`, the template will bump and the `.tgz` will drop.

## Pattern for future patches

When a new upstream bug blocks vexpo:

1. Build a minimal repro outside the vexpo monorepo. Two reasons: it's easier for maintainers to triage, and it forces you to isolate the variable.
2. File the repro as a public repo under your account (mirror of the `convex-better-auth-368-repro` style).
3. Open the upstream PR with the fix + a link to the repro.
4. Ship the patch as a `.tgz` in `templates/default/patches/` and reference via `file:` install.
5. Document the entry here.
6. Remove the patch + bump the dependency when upstream merges.

The patches directory ships with the template (the `create-vexpo` tsup config doesn't filter it), so users who scaffold a project today get the same patched behavior the maintainer is running. When upstream catches up, one PR removes the patch across the monorepo and every fresh scaffold.
