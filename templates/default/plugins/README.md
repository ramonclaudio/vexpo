# plugins

## `with-auto-signing.js`

Forces automatic code signing for the Xcode project during local `prebuild`. Sets `CODE_SIGN_STYLE = Automatic` on every build configuration with a `PRODUCT_BUNDLE_IDENTIFIER`, drops any leftover `PROVISIONING_PROFILE*` keys, and sets `DEVELOPMENT_TEAM` from `ios.appleTeamId`.

No-ops when `EAS_BUILD` is set, so EAS continues to use the provisioning profile from the build credentials.

Use: local `bun run ios` on a physical device without juggling provisioning profiles in Xcode.

## `with-pod-deployment-target.js`

Pins `IPHONEOS_DEPLOYMENT_TARGET` to the same minimum across every Pod target. Without it, transitive pods can pull deployment targets backward and break the build on iOS 16.4 features.

## `with-quiet-build-warnings.js`

Silences one Xcode warning: `Script has ambiguous dependencies causing it to run on every build` for `[Expo Dev Launcher] Strip Local Network Keys for Release`. Sets `alwaysOutOfDate = "1"` on the phase, which is Xcode 15+'s explicit opt-in for "yes, this script intentionally runs every build, don't warn."

Targeted: only this one phase, only this one warning. Other output-less script phases still surface their own warnings; build-time errors and linker output are untouched.

Open upstream issue in `expo-dev-launcher`'s `withDevLauncher.ts`. Drop the plugin when the upstream phase ships with the flag set.

`ld: warning: ignoring duplicate libraries: '-lc++'` is intentionally NOT suppressed. Apple's flag for it (`-Wl,-no_warn_duplicate_libraries`) hides every "duplicate libraries" warning, not just `-lc++`. One cosmetic log line per build is a fair price for keeping the broader linker signal intact.
