const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withJetifier(config) {
  return withGradleProperties(config, (config) => {
    // Check if it already exists to avoid duplicates
    const existing = config.modResults.find((item) => item.type === 'property' && item.key === 'android.enableJetifier');
    if (!existing) {
      config.modResults.push({
        type: 'property',
        key: 'android.enableJetifier',
        value: 'true',
      });
    } else {
      existing.value = 'true';
    }
    return config;
  });
};
