/** @type {import('@bacons/apple-targets/app.config').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  // Lock Screen accessory widgets require iOS 16; Home Screen widgets 14.
  deploymentTarget: '16.0',
  // Shared container so the RN app can hand the widget its data snapshot.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.cannon.mobile'],
  },
});
