import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from 'vite';

const rootDir = process.cwd();

function getModeFromArgs() {
      const idx = process.argv.indexOf('--mode');
      if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
      return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

async function main() {
      const mode = getModeFromArgs();
      const env = loadEnv(mode, rootDir, 'VITE_');

      const templatePath = path.join(rootDir, 'public', 'firebase-messaging-sw.template.js');
      const outputPath = path.join(rootDir, 'public', 'firebase-messaging-sw.js');

      const template = await fs.readFile(templatePath, 'utf8');

      const replacements = {
            '__VITE_FIREBASE_API_KEY__': env.VITE_FIREBASE_API_KEY || '',
            '__VITE_FIREBASE_AUTH_DOMAIN__': env.VITE_FIREBASE_AUTH_DOMAIN || '',
            '__VITE_FIREBASE_PROJECT_ID__': env.VITE_FIREBASE_PROJECT_ID || '',
            '__VITE_FIREBASE_STORAGE_BUCKET__': env.VITE_FIREBASE_STORAGE_BUCKET || '',
            '__VITE_FIREBASE_MESSAGING_SENDER_ID__': env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
            '__VITE_FIREBASE_APP_ID__': env.VITE_FIREBASE_APP_ID || '',
      };

      let output = template;
      for (const [key, value] of Object.entries(replacements)) {
            output = output.split(key).join(value);
      }

      await fs.writeFile(outputPath, output, 'utf8');

      const configured = !!(
            replacements.__VITE_FIREBASE_API_KEY__ &&
            replacements.__VITE_FIREBASE_PROJECT_ID__ &&
            replacements.__VITE_FIREBASE_MESSAGING_SENDER_ID__ &&
            replacements.__VITE_FIREBASE_APP_ID__
      );

      console.log(
            `[generate-firebase-sw] mode=${mode} output=public/firebase-messaging-sw.js configured=${configured}`,
      );
}

main().catch((error) => {
      console.error('[generate-firebase-sw] failed:', error);
      process.exit(1);
});
