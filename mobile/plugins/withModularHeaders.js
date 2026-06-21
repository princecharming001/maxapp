const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// AppCheckCore (pulled in by GoogleSignIn 9.2.0) is a Swift pod that depends on
// GoogleUtilities and RecaptchaInterop, which don't define modules by default.
// In static library mode, Swift pods need their ObjC deps to expose module maps.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const marker = '  use_expo_modules!';
      const injection = [
        "  pod 'GoogleUtilities', :modular_headers => true",
        "  pod 'RecaptchaInterop', :modular_headers => true",
      ].join('\n');

      if (podfile.includes(marker) && !podfile.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        podfile = podfile.replace(marker, `${marker}\n${injection}`);
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
};
