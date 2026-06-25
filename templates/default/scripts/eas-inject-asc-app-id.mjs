// Writes the App Store Connect app id (from the ASC_APP_ID env var) into every
// eas.json submit profile, so a non-interactive `eas submit` in CI can resolve
// the app without committing the id into the repo. `eas submit --non-interactive`
// reads ascAppId ONLY from the submit profile, so the release/deploy workflows
// run this just before submitting.
//
// No-op when ASC_APP_ID is unset: then eas.json's own committed ascAppId (if any)
// is used as-is, so this is safe for users who do commit their id.
import { readFileSync, writeFileSync } from "node:fs";

const id = process.env.ASC_APP_ID?.trim();
if (!id) {
  console.log("ASC_APP_ID not set; leaving eas.json submit profiles as-is");
  process.exit(0);
}

const path = "eas.json";
const cfg = JSON.parse(readFileSync(path, "utf8"));
let count = 0;
for (const profile of Object.values(cfg.submit ?? {})) {
  if (profile && typeof profile === "object" && profile.ios && typeof profile.ios === "object") {
    profile.ios.ascAppId = id;
    count += 1;
  }
}
writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
console.log(`wrote ascAppId ${id} into ${count} submit profile(s)`);
