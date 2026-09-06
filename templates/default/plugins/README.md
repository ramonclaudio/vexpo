# plugins

## `with-auto-signing.js`

This plugin turns on automatic code signing for the Xcode project during a local `prebuild`. It sets `CODE_SIGN_STYLE = Automatic` on every build configuration with a `PRODUCT_BUNDLE_IDENTIFIER`, removes any leftover `PROVISIONING_PROFILE*` keys, and sets `DEVELOPMENT_TEAM` from `ios.appleTeamId`.

It does nothing when `EAS_BUILD` is set, so EAS keeps using the provisioning profile from the build credentials.

## `with-pod-deployment-target.js`

This one sets every CocoaPods target to `IPHONEOS_DEPLOYMENT_TARGET = 16.4` during `prebuild`, by adding a block to the `Podfile` right after `react_native_post_install`. The value comes from the plugin's `target` option, which `app.config.ts` sets to `16.4`, the same as the `deploymentTarget` it passes to `expo-build-properties`. React Native's own `updateOSDeploymentTarget` only raises each pod to `max(15.1, whatever the pod declares)`, so without this plugin a pod declaring less than 16.4 still ends up under the iOS 16.4 floor the template targets. Running it again is safe, since a marker comment makes it a no-op once applied.
