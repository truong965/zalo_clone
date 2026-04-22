const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidComponentFactory(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;

    // Ensure xmlns:tools exists
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = manifest.application[0];
    
    // Add tools:replace
    let toolsReplace = app.$['tools:replace'] || '';
    if (!toolsReplace.includes('android:appComponentFactory')) {
      toolsReplace = toolsReplace ? `${toolsReplace},android:appComponentFactory` : 'android:appComponentFactory';
      app.$['tools:replace'] = toolsReplace;
    }
    
    // Set the appComponentFactory
    app.$['android:appComponentFactory'] = 'androidx.core.app.CoreComponentFactory';

    return config;
  });
};
