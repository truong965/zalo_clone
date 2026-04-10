const fs = require('fs');
const path = require('path');

const ANDROID_FILE = path.join(__dirname, '../google-services.json');
const IOS_FILE = path.join(__dirname, '../GoogleService-Info.plist');

const setupFile = (envVar, filePath, label) => {
  const base64Content = process.env[envVar];

  if (base64Content) {
    console.log(`[Setup] Rebuilding ${label} from environment variable ${envVar}...`);
    const buffer = Buffer.from(base64Content, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`[Setup] Successfully created ${label} at ${filePath}`);
  } else {
    if (fs.existsSync(filePath)) {
      console.log(`[Setup] ${label} already exists locally. Skipping...`);
    } else {
      console.warn(`[Setup] WARNING: ${envVar} not found and ${label} missing locally!`);
      console.warn(`[Setup] Build might fail if ${label} is required.`);
    }
  }
};

// Main execution
console.log('[Setup] Checking Google Services configuration...');

setupFile('GOOGLE_SERVICES_ANDROID_BASE64', ANDROID_FILE, 'google-services.json');
setupFile('GOOGLE_SERVICES_IOS_BASE64', IOS_FILE, 'GoogleService-Info.plist');

console.log('[Setup] Done.');
