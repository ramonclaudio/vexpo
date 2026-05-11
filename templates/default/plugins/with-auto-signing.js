const { withXcodeProject } = require("@expo/config-plugins");

const withAutoSigning = (config) => {
  if (process.env.EAS_BUILD) return config;

  return withXcodeProject(config, async (cfg) => {
    const xcodeProject = cfg.modResults;

    const targetName = xcodeProject.getFirstTarget()?.firstTarget?.name;
    if (!targetName) {
      console.warn("[with-auto-signing] Could not find main target");
      return cfg;
    }

    const buildConfigurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in buildConfigurations) {
      const buildConfig = buildConfigurations[key];
      if (buildConfig.buildSettings && buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER) {
        buildConfig.buildSettings.CODE_SIGN_STYLE = "Automatic";
        if (cfg.ios?.appleTeamId) {
          buildConfig.buildSettings.DEVELOPMENT_TEAM = cfg.ios.appleTeamId;
        }
        delete buildConfig.buildSettings.PROVISIONING_PROFILE;
        delete buildConfig.buildSettings.PROVISIONING_PROFILE_SPECIFIER;
      }
    }

    const projectSection = xcodeProject.pbxProjectSection();
    for (const key in projectSection) {
      const project = projectSection[key];
      if (project.attributes && project.attributes.TargetAttributes) {
        for (const targetId in project.attributes.TargetAttributes) {
          project.attributes.TargetAttributes[targetId].ProvisioningStyle = "Automatic";
          if (cfg.ios?.appleTeamId) {
            project.attributes.TargetAttributes[targetId].DevelopmentTeam = cfg.ios.appleTeamId;
          }
        }
      }
    }

    return cfg;
  });
};

module.exports = withAutoSigning;
