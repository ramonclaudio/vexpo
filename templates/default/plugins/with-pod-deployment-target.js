const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# with-pod-deployment-target";

const buildInjection = (target) => `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${target}'
      end
    end
`;

const withPodDeploymentTarget = (config, { target = "16.4" } = {}) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const podfile = fs.readFileSync(podfilePath, "utf8");
      if (podfile.includes(MARKER)) return cfg;

      const injection = buildInjection(target);
      const re = /(react_native_post_install\([\s\S]*?\n\s*\)\n)/;
      if (!re.test(podfile)) {
        throw new Error("with-pod-deployment-target: react_native_post_install call not found");
      }
      const next = podfile.replace(re, `$1${injection}`);
      fs.writeFileSync(podfilePath, next);
      return cfg;
    },
  ]);

module.exports = withPodDeploymentTarget;
