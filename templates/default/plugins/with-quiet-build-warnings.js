const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Silences the Xcode "Script has ambiguous dependencies causing it to
 * run on every build" warning emitted for
 * `[Expo Dev Launcher] Strip Local Network Keys for Release`.
 *
 * The phase has no declared outputs because it patches `Info.plist`
 * in-place. Xcode 14+ flags any output-less phase as ambiguous and
 * surfaces a warning on every build. Xcode 15+ added an explicit opt-in
 * (`alwaysOutOfDate`) for "yes, this script intentionally runs every
 * build, don't warn." We set it on this one phase only.
 *
 * Targeted suppression: it does NOT affect other phases or other
 * warnings. Other output-less script phases (yours, or future Pods')
 * still surface the same warning. Build-time errors and other linker
 * output are untouched.
 *
 * Open upstream issue in `expo-dev-launcher`'s `withDevLauncher.ts`.
 * Drop this plugin when the upstream phase ships with the flag set.
 *
 * `ld: warning: ignoring duplicate libraries: '-lc++'` (Xcode 16 linker)
 * is intentionally NOT suppressed: Apple's flag for it
 * (`-Wl,-no_warn_duplicate_libraries`) hides every "ignoring duplicate
 * libraries" warning, not just `-lc++`. The cosmetic line per build is
 * a fair price for keeping the broader signal intact.
 */
const DEV_LAUNCHER_PHASE_NAME = "[Expo Dev Launcher] Strip Local Network Keys for Release";

const withQuietBuildWarnings = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const key of Object.keys(phases)) {
      if (key.endsWith("_comment")) continue;
      const phase = phases[key];
      if (!phase || typeof phase !== "object") continue;
      if (phase.name && phase.name.replace(/"/g, "") === DEV_LAUNCHER_PHASE_NAME) {
        phase.alwaysOutOfDate = "1";
      }
    }
    return cfg;
  });

module.exports = withQuietBuildWarnings;
