import 'dotenv/config';

export default ({ config }) => {
  return {
    ...config,
    ios: {
      ...config.ios,
      googleServicesFile: process.env.GOOGLE_SERVICES_IOS_PATH || './GoogleService-Info.plist',
    },
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_ANDROID_PATH || './google-services.json',
    },
    extra: {
      ...config.extra,
      // You can add more dynamic environment variables here
    },
  };
};
