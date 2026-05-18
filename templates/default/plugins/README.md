# plugins

## `with-auto-signing.js`

Forces automatic code signing for the Xcode project during local `prebuild`. Sets `CODE_SIGN_STYLE = Automatic` on every build configuration with a `PRODUCT_BUNDLE_IDENTIFIER`, drops any leftover `PROVISIONING_PROFILE*` keys, and sets `DEVELOPMENT_TEAM` from `ios.appleTeamId`.

No-ops when `EAS_BUILD` is set, so EAS continues to use the provisioning profile from the build credentials.

Use: local `bun run ios` on a physical device without juggling provisioning profiles in Xcode.

## `with-pod-deployment-target.js`

Pins `IPHONEOS_DEPLOYMENT_TARGET` to the same minimum across every Pod target. Without it, transitive pods can pull deployment targets backward and break the build on iOS 16.4 features.

## `with-quiet-build-warnings.js`

Suppresses two Xcode warnings that fire every build but carry no signal:

- `Script has ambiguous dependencies causing it to run on every build` from `[Expo Dev Launcher] Strip Local Network Keys for Release`. Sets `alwaysOutOfDate = 1` on the phase, which is Xcode 15+'s explicit opt-in for "yes, this script intentionally runs every build." Open upstream issue in `expo-dev-launcher`.
- `ld: warning: ignoring duplicate libraries: '-lc++'` from Xcode 16's linker when `-lc++` shows up twice in `OTHER_LDFLAGS` (Pods inject it; the app target picks it up from the default C++ runtime link). Adds `-Wl,-no_warn_duplicate_libraries` to the app target and to every Pod target's `OTHER_LDFLAGS`, Apple's recommended flag for exactly this case.

Drop the plugin from `app.config.ts` if either warning ever gets fixed upstream.
