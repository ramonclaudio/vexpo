# credentials/

Put the Apple `.p8` keys here. The folder is gitignored, only this README is tracked.

| File                          | What it is                                    | Where it goes                          |
| ----------------------------- | --------------------------------------------- | -------------------------------------- |
| `AuthKey_XXXXXX.p8`           | App Store Connect API key (role App Manager)  | EAS, for builds and submits            |
| the Sign in with Apple `.p8`  | signs the Sign in with Apple client secret    | stays here, `vexpo apple jwt` reads it |

Both download from Apple as `AuthKey_*.p8`. Keep one at a time here if you want the CLI to find it on its own.

```bash
# 1. Download the App Store Connect API key (Users and Access, Integrations,
#    App Store Connect API) and drop it here.
# 2. Check it and cache it. The CLI finds this folder on its own.
npx vexpo apple asc-key
# 3. Upload it to EAS so cloud builds and submits can use it.
npx vexpo apple credentials
# 4. Link the project to its App Store Connect app. Writes ascAppId into eas.json.
npx vexpo asc connect
```

Keep the App Store Connect key here after the upload. `vexpo submit` and `vexpo asc connect` write its path into the eas.json submit profiles, and that only works while the file is inside the project. That leaves two live keys. This one is for `vexpo submit`, the EAS-managed one is for cloud auto-submits.

Keep the Sign in with Apple key here too. The client secret it signs lasts 180 days, and `vexpo apple jwt --rotate` needs the file to sign the next one.

`npx vexpo doctor` checks the key, its role, and the link to the App Store Connect app.
