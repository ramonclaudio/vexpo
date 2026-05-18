const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Silences two Xcode warnings that fire every build and add noise without
 * signal:
 *
 *   1. "Script has ambiguous dependencies causing it to run on every build"
 *      from `[Expo Dev Launcher] Strip Local Network Keys for Release`.
 *      The phase has no declared outputs because it patches Info.plist
 *      in-place. Xcode 14+ flags any output-less phase as ambiguous and
 *      hides the rest of the build output behind the warning. We set
 *      `alwaysOutOfDate = 1` on the phase, which is Xcode 15+'s way of
 *      explicitly opting into "yes, this is intentional, don't warn."
 *      Open issue upstream: dev-launcher creates this phase without the
 *      flag set.
 *
 *   2. `ld: warning: ignoring duplicate libraries: '-lc++'`
 *      Xcode 16's linker complains when -lc++ shows up twice in OTHER_LDFLAGS,
 *      which happens because Pods inject -lc++ and the app target also has
 *      it via the default C++ runtime link. Suppress via
 *      `-Wl,-no_warn_duplicate_libraries` on the app target's OTHER_LDFLAGS.
 *      Apple's recommended flag for this exact case.
 */
const DEV_LAUNCHER_PHASE_NAME = "[Expo Dev Launcher] Strip Local Network Keys for Release";
const NO_WARN_DUP_LIBS = "-Wl,-no_warn_duplicate_libraries";
const PODFILE_MARKER = "# with-quiet-build-warnings";

const withQuietBuildWarnings = (config) => {
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // 1. Tag the dev-launcher script phase as always-out-of-date.
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const key of Object.keys(phases)) {
      if (key.endsWith("_comment")) continue;
      const phase = phases[key];
      if (!phase || typeof phase !== "object") continue;
      if (phase.name && phase.name.replace(/"/g, "") === DEV_LAUNCHER_PHASE_NAME) {
        phase.alwaysOutOfDate = "1";
      }
    }

    // 2. Add the linker flag to every build configuration that links the
    //    app binary (i.e. those with PRODUCT_BUNDLE_IDENTIFIER set).
    const buildConfigurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigurations)) {
      const buildConfig = buildConfigurations[key];
      if (!buildConfig || !buildConfig.buildSettings) continue;
      if (!buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER) continue;
      const existing = buildConfig.buildSettings.OTHER_LDFLAGS;
      if (Array.isArray(existing)) {
        if (!existing.includes(NO_WARN_DUP_LIBS)) existing.push(`"${NO_WARN_DUP_LIBS}"`);
        buildConfig.buildSettings.OTHER_LDFLAGS = existing;
      } else if (typeof existing === "string") {
        if (!existing.includes(NO_WARN_DUP_LIBS)) {
          buildConfig.buildSettings.OTHER_LDFLAGS = [existing, `"${NO_WARN_DUP_LIBS}"`];
        }
      } else {
        buildConfig.buildSettings.OTHER_LDFLAGS = ['"$(inherited)"', `"${NO_WARN_DUP_LIBS}"`];
      }
    }

    return cfg;
  });

  // 3. Same linker flag on every Pod target. Without this, only the user
  //    target gets the suppression; some Pods relink and re-emit the warning.
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const podfile = fs.readFileSync(podfilePath, "utf8");
      if (podfile.includes(PODFILE_MARKER)) return cfg;

      const injection = `
    ${PODFILE_MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        existing = c.build_settings['OTHER_LDFLAGS']
        flags = existing.is_a?(Array) ? existing.dup : (existing.is_a?(String) ? existing.split(' ') : ['$(inherited)'])
        flags << '${NO_WARN_DUP_LIBS}' unless flags.include?('${NO_WARN_DUP_LIBS}')
        c.build_settings['OTHER_LDFLAGS'] = flags
      end
    end
`;
      const re = /(react_native_post_install\([\s\S]*?\n\s*\)\n)/;
      if (!re.test(podfile)) {
        throw new Error("with-quiet-build-warnings: react_native_post_install call not found");
      }
      fs.writeFileSync(podfilePath, podfile.replace(re, `$1${injection}`));
      return cfg;
    },
  ]);

  return config;
};

module.exports = withQuietBuildWarnings;
