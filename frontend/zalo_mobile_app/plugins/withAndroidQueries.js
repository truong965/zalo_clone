const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to inject <queries> into AndroidManifest.xml
 * This is required for Android 11+ package visibility.
 */
module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Ensure <queries> exists
    if (!androidManifest.queries) {
      androidManifest.queries = [{}];
    }

    const queries = androidManifest.queries[0];

    // Ensure <intent> exists inside <queries>
    if (!queries.intent) {
      queries.intent = [];
    }

    // Add otpauth scheme if it doesn't exist
    const hasOtpAuth = queries.intent.some(
      (intent) => intent.data && intent.data[0].$['android:scheme'] === 'otpauth'
    );

    if (!hasOtpAuth) {
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [
          {
            $: {
              'android:scheme': 'otpauth',
            },
          },
        ],
      });
    }

    return config;
  });
};
