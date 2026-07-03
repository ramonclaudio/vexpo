# credentials/

Staging area for the one-time Apple `.p8` downloads you upload to EAS. This folder is gitignored (only this README is tracked).

## What goes here

| File                | What it is                                            | Where it ends up                         |
| ------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `AuthKey_XXXXXX.p8` | App Store Connect API key (role: **App Manager**)     | EAS credential store, for build + submit |
| your SIWA `.p8`     | Sign in with Apple key, signs the `client_secret` JWT | `APPLE_P8_PRIVATE_KEY` (EAS env, secret) |

Both download from App Store Connect as `AuthKey_*.p8`, so keep one at a time here if you want the CLI to auto-detect it.

## How to use it

```bash
# 1. Download the App Manager ASC API key from App Store Connect
#    (Users and Access -> Integrations -> App Store Connect API), drop it here.
# 2. Register + validate it with the CLI (auto-detects this folder):
npx vexpo apple asc-key
# 3. Upload it to EAS so cloud builds/submits can use it:
npx eas-cli credentials --platform ios   # App Store Connect API Key -> set up
# 4. Link the project to its ASC app (writes ascAppId into eas.json):
npx vexpo asc connect
```

After upload, delete the local `.p8`. EAS holds it.

Run `npx vexpo doctor` to confirm the key, its role, and the linkage are all green.
