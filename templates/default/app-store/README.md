# App Store Connect checklist

One-time settings you make in App Store Connect. `[metadata:push]` items also live in `store.config.json` and re-push with `npm run metadata:push`. `[dashboard]` items have no API, so you set them by hand. `privacy.config.json` and `accessibility.config.json` here are the versioned sources, checked by `vexpo asc privacy lint` and `vexpo asc accessibility lint`.

## App Information

- `[metadata:push]` Subtitle
- `[metadata:push]` Primary and secondary category (placeholder is Developer Tools, change it)
- `[dashboard]` Content rights declaration
- `[metadata:push]` Age rating questionnaire (also in `store.config.json` advisory)

## App Privacy

- `[dashboard]` Data-collection nutrition labels. The template collects contact info and identifiers linked to identity, plus diagnostics that aren't. Nothing is used for tracking. Put the same answers in `privacy.config.json` and keep `vexpo asc privacy lint` green.
- `[metadata:push]` Privacy policy URL

## Pricing and Availability

- `[dashboard]` Price and country availability
- `[dashboard]` Apple Silicon Mac and Vision Pro availability. Leave both off unless you test on them.

## Version page

- `[metadata:push]` Support URL, marketing URL, copyright
- `[metadata:push]` App Review contact and demo login (`vexpo review-account` creates the matching account), review notes
- `[metadata:push]` Automatic or phased release
- `[dashboard]` Build attachment. Leave the version unattached until you mean to ship.
- `[dashboard]` Screenshots. 6.9-inch at 1320x2868 and 6.7-inch at 1290x2796, portrait PNGs, up to ten each. EAS Metadata does not upload them.

## App Accessibility

- The template ships with VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color, Sufficient Contrast and Reduced Motion on. Captions and audio descriptions are off because nothing plays media. They live in `accessibility.config.json`, one entry per device family, nine booleans, the shape of Apple's `AccessibilityDeclaration`.
- `vexpo asc accessibility lint` checks the shape. `push` sends it, and `--publish` moves the draft onto the App Store page. Apple only accepts changes while a declaration is a draft, so delete a published one in App Store Connect before you replace it.
- A top-level `url` in the same file is the accessibility link on the product page. `push` sets it when the key is there, `null` clears it, and a file without the key leaves App Store Connect alone.
- Apple judges by task. Every common task (first launch, sign in, purchase, settings, the app's main job) has to work with the feature on.
- Re-check every feature against your own screens before you push. The declaration describes the template, and Apple holds you to it.

## TestFlight

- `vexpo testflight groups create` and `invite` for beta groups and testers.
- `[dashboard]` Test Information (beta description, feedback email, URLs, review contact, demo login). Required before you add an external tester.

## Usually not applicable

- Encryption is answered per build by `ITSAppUsesNonExemptEncryption: false` in `app.config.ts`.
- Digital Services Act trader status. Non-trader fits a free app.
- Vietnam game license, medical device declaration, subscription server notifications. Skip unless they apply.

Keep `store.config.json` as the source of truth. Copy any `[metadata:push]` field you set by hand back into it, and keep `npx eas-cli metadata:lint` green. The working file is gitignored because it holds the demo password, so put anything you want versioned into `store.config.example.json`.
