# App Store Connect dashboard checklist

One-time settings you configure in the ASC web UI, cataloged from a real 0→1 run. Items tagged `[metadata:push]` are mirrored in `store.config.json` and re-pushable with `npm run metadata:push` once real copy exists. `[dashboard]` items have no CLI or API path and stay manual forever: `privacy.config.json` and `accessibility.config.json` in this directory are versioned mirrors with `vexpo asc privacy lint` / `vexpo asc accessibility lint` validators, Apple exposes no write API for them.

## App Information

- `[metadata:push]` Subtitle
- `[metadata:push]` Primary + secondary category (the template placeholder is Developer Tools, change it)
- `[dashboard]` Content rights declaration (third-party content yes or no)
- `[metadata:push]` Age rating questionnaire (mirrored in `store.config.json` advisory)

## App Privacy

- `[dashboard]` Data-collection nutrition labels: data types, purposes, linked-to-identity, tracking. What the template ships collects contact info + identifiers (linked, app functionality) and diagnostics (not linked), nothing used for tracking. Mirror your answers in `privacy.config.json` and keep `vexpo asc privacy lint` green.
- `[metadata:push]` Privacy policy URL (the label data itself is dashboard-only)

## Pricing and Availability

- `[dashboard]` Price and country availability
- `[dashboard]` Apple Silicon Mac and Apple Vision Pro availability: switch both OFF unless you actually test those surfaces, an untested compatibility surface is review risk with zero upside

## Version page

- `[metadata:push]` Support URL, marketing URL, copyright
- `[metadata:push]` App Review contact (name and a real phone number), demo credentials (`vexpo review-account` seeds the matching login), review notes
- `[metadata:push]` Automatic or phased release
- `[dashboard]` Build attachment: leave the version UNattached until you mean to ship, or a template build can head into App Store review

## App Accessibility

- `[dashboard]` Declare the features the template ships: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color, Sufficient Contrast, Reduced Motion. Mirror in `accessibility.config.json`, verify with `vexpo asc accessibility lint`. Saves as a draft, Apple publishes it with your first released version.

## TestFlight

- CLI: beta groups and testers via `vexpo testflight groups create` / `invite`
- `[dashboard]` Test Information: beta description, feedback email, URLs, external-beta review contact and demo login. Required before any external tester can be added.

## Audited, usually not applicable

- Encryption: answered per-build by `ITSAppUsesNonExemptEncryption: false` in `app.config.ts`, never a dashboard step
- DSA trader status: non-trader is right for a free app, revisit if commerce ships
- Vietnam game license, medical device declaration, subscription server notifications and shared secret: skip unless they apply

Keep `store.config.json` the source of truth: when you set a `[metadata:push]` field by hand in ASC, sync it back so a later push can't regress it, and keep `npm run metadata:lint` green.
