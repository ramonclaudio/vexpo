# App Store Connect dashboard checklist

These are the one-time settings you set in the ASC web UI. Items tagged `[metadata:push]` are also in `store.config.json` and can be re-pushed with `npm run metadata:push` once you have real copy. `[dashboard]` items have no CLI or API, so you set them by hand. `privacy.config.json` and `accessibility.config.json` in this directory are the versioned sources, checked by `vexpo asc privacy lint` and `vexpo asc accessibility lint`. Privacy has no write API, so it stays a dashboard step. Accessibility does have one, so `vexpo asc accessibility push` sends it.

## App Information

- `[metadata:push]` Subtitle
- `[metadata:push]` Primary and secondary category (the template placeholder is Developer Tools, change it)
- `[dashboard]` Content rights declaration (third-party content yes or no)
- `[metadata:push]` Age rating questionnaire (also in `store.config.json` advisory)

## App Privacy

- `[dashboard]` Data-collection nutrition labels, meaning data types, purposes, linked-to-identity and tracking. The template as shipped collects contact info and identifiers, linked to identity for app functionality, plus diagnostics that aren't linked. Nothing is used for tracking. Put the same answers in `privacy.config.json` and keep `vexpo asc privacy lint` green.
- `[metadata:push]` Privacy policy URL (the label data itself is dashboard-only)

## Pricing and Availability

- `[dashboard]` Price and country availability
- `[dashboard]` Apple Silicon Mac and Apple Vision Pro availability. Switch both OFF unless you actually test on them, since an untested platform is one more thing App Review can reject

## Version page

- `[metadata:push]` Support URL, marketing URL, copyright
- `[metadata:push]` App Review contact (name and a real phone number), demo credentials (`vexpo review-account` creates the matching login), review notes
- `[metadata:push]` Automatic or phased release
- `[dashboard]` Build attachment. Leave the version UNattached until you mean to ship, or a template build can end up in App Store review

## App Accessibility

- The template ships with these features on. VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast and Reduced Motion. Captions and audio descriptions are false because nothing here plays media. They are in `accessibility.config.json`, one entry per device family with nine booleans, which is the shape of Apple's `AccessibilityDeclaration`.
- `vexpo asc accessibility lint <file>` checks the shape. `vexpo asc accessibility push <file>` sends it, creating the declaration or updating the draft, and `--publish` moves it onto the App Store page. `--dry-run` prints what would change. Apple only accepts changes while a declaration is a draft, so a published one has to be deleted in App Store Connect before it can be replaced. `store.config.json` doesn't hold any of this and `eas metadata:push` won't send it.
- `vexpo asc accessibility url <https url>` sets the accessibility link on the product page, `--clear` removes it, and no argument shows the current one. It is on the app resource, not on the declarations, so `push` never touches it. Apple points at it for what the nine booleans cannot say, including the parts of an app that don't support a feature.
- Apple judges by task. Every common task, which they define as first launch, sign in, purchase, settings and the app's primary job, has to be doable with the feature turned on. Not "the screens have labels", the whole task, done with only that feature.
- The `notes` field says what backs each one in the template's own code. `npm run test` in the template checks one of them. `__tests__/lib/contrast.test.ts` measures the text pairings at 4.5:1 and the control pairings at 3:1 across all four appearances, so Sufficient Contrast is measured rather than assumed. The rest are read from the source, and nobody has heard the app with VoiceOver on.
- Re-check every feature against your own screens before you push. The template's declaration describes the template. A screen you add with an unlabeled control, a pinned font size or a color pair that misses 4.5:1 makes it wrong, and the declaration is what Apple holds you to.

## TestFlight

- CLI. Beta groups and testers through `vexpo testflight groups create` and `invite`
- `[dashboard]` Test Information, meaning beta description, feedback email, URLs, external-beta review contact and demo login. Required before any external tester can be added.

## Audited, usually not applicable

- Encryption is answered per-build by `ITSAppUsesNonExemptEncryption: false` in `app.config.ts`, never a dashboard step
- Digital Services Act (DSA) trader status. Non-trader is right for a free app, revisit if commerce ships
- Vietnam game license, medical device declaration, subscription server notifications and shared secret. Skip unless they apply

Keep `store.config.json` as the source of truth. When you set a `[metadata:push]` field by hand in ASC, copy it back so a later push can't undo it, and keep `npx eas-cli metadata:lint` green. The working file is gitignored because it holds the App Review demo password, so copy anything you want versioned into the tracked `store.config.example.json` too.
