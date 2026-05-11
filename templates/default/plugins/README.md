# plugins

## `with-auto-signing.js`

Forces automatic code signing for the Xcode project during local `prebuild`. Sets `CODE_SIGN_STYLE = Automatic` on every build configuration with a `PRODUCT_BUNDLE_IDENTIFIER`, drops any leftover `PROVISIONING_PROFILE*` keys, and sets `DEVELOPMENT_TEAM` from `ios.appleTeamId`.

No-ops when `EAS_BUILD` is set, so EAS continues to use the provisioning profile from the build credentials.

Use: local `bun run ios` on a physical device without juggling provisioning profiles in Xcode.
