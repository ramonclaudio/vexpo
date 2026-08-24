# plugins

## `with-auto-signing.js`

This plugin forces automatic code signing for the Xcode project during local `prebuild`. It sets `CODE_SIGN_STYLE = Automatic` on every build configuration with a `PRODUCT_BUNDLE_IDENTIFIER`, drops any leftover `PROVISIONING_PROFILE*` keys, and sets `DEVELOPMENT_TEAM` from `ios.appleTeamId`.

It no-ops when `EAS_BUILD` is set, so EAS keeps using the provisioning profile from the build credentials.

## `with-pod-deployment-target.js`

This one forces every CocoaPods target to `IPHONEOS_DEPLOYMENT_TARGET = 16.4` during `prebuild`, injected into the `Podfile` right after `react_native_post_install`. The value comes from the plugin's `target` option, which `app.config.ts` sets to `16.4`, matching the `deploymentTarget` it passes to `expo-build-properties`. React Native's own `updateOSDeploymentTarget` only floors each pod at `max(15.1, whatever the pod declares)`, so without this plugin a pod declaring less than 16.4 still lands under the iOS 16.4 floor the template targets. Re-running is safe, since a marker comment makes it a no-op once applied.
