# App Store Connect dashboard checklist

These are the one-time settings you configure in the ASC web UI. Items tagged `[metadata:push]` are mirrored in `store.config.json` and can be re-pushed with `npm run metadata:push` once real copy exists, while `[dashboard]` items have no CLI or API path and stay manual. `privacy.config.json` and `accessibility.config.json` in this directory are versioned mirrors, checked by `vexpo asc privacy lint` and `vexpo asc accessibility lint`, since Apple has no write API for either one.

## App Information

- `[metadata:push]` Subtitle
- `[metadata:push]` Primary + secondary category (the template placeholder is Developer Tools, change it)
- `[dashboard]` Content rights declaration (third-party content yes or no)
- `[metadata:push]` Age rating questionnaire (mirrored in `store.config.json` advisory)

## App Privacy

- `[dashboard]` Data-collection nutrition labels: data types, purposes, linked-to-identity, tracking. What the template ships collects contact info and identifiers, linked to identity for app functionality, plus diagnostics that aren't linked. Nothing is used for tracking. Mirror your answers in `privacy.config.json` and keep `vexpo asc privacy lint` green.
- `[metadata:push]` Privacy policy URL (the label data itself is dashboard-only)

## Pricing and Availability

- `[dashboard]` Price and country availability
- `[dashboard]` Apple Silicon Mac and Apple Vision Pro availability. Switch both OFF unless you actually test on them, since an untested surface is one more thing App Review can reject

## Version page

- `[metadata:push]` Support URL, marketing URL, copyright
- `[metadata:push]` App Review contact (name and a real phone number), demo credentials (`vexpo review-account` seeds the matching login), review notes
- `[metadata:push]` Automatic or phased release
- `[dashboard]` Build attachment: leave the version UNattached until you mean to ship, or a template build can head into App Store review

## App Accessibility

- `[dashboard]` Declare the features the template ships: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color, Sufficient Contrast, Reduced Motion. Mirror in `accessibility.config.json`, verify with `vexpo asc accessibility lint`. Saves as a draft, Apple publishes it with your first released version.

## TestFlight

- CLI: beta groups and testers via `vexpo testflight groups create` and `invite`
- `[dashboard]` Test Information: beta description, feedback email, URLs, external-beta review contact and demo login. Required before any external tester can be added.

## Audited, usually not applicable

- Encryption: answered per-build by `ITSAppUsesNonExemptEncryption: false` in `app.config.ts`, never a dashboard step
- Digital Services Act (DSA) trader status: non-trader is right for a free app, revisit if commerce ships
- Vietnam game license, medical device declaration, subscription server notifications and shared secret: skip unless they apply

Keep `store.config.json` as the source of truth. When you set a `[metadata:push]` field by hand in ASC, sync it back so a later push can't regress it, and keep `npx eas-cli metadata:lint` green. The working file is gitignored because it holds the App Review demo password, so copy anything you want versioned into the tracked `store.config.example.json` too.
