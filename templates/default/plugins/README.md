# plugins

## `with-auto-signing.js`

Forces automatic code signing for the Xcode project during local `prebuild`. Sets `CODE_SIGN_STYLE = Automatic` on every build configuration with a `PRODUCT_BUNDLE_IDENTIFIER`, drops any leftover `PROVISIONING_PROFILE*` keys, and sets `DEVELOPMENT_TEAM` from `ios.appleTeamId`.

No-ops when `EAS_BUILD` is set, so EAS continues to use the provisioning profile from the build credentials.

## `with-pod-deployment-target.js`

Forces every CocoaPods target to `IPHONEOS_DEPLOYMENT_TARGET = 16.4` during `prebuild`, injected into the `Podfile` right after `react_native_post_install`. Without it, transitive pods can fall back to a lower minimum and break the iOS 16.4 floor the template targets. Re-running is safe: a marker comment makes it a no-op once applied.
