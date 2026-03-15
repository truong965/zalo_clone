import { promises as fs } from 'fs';
import path from 'path';

const rootDir = process.cwd();
const swPath = path.join(rootDir, 'public', 'firebase-messaging-sw.js');

const requiredMarkers = [
      'firebase.initializeApp(',
      'importScripts(\'https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js\')',
      'importScripts(\'https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js\')',
];

const placeholderPattern = /__VITE_FIREBASE_[A-Z0-9_]+__/g;

async function main() {
      let content;

      try {
            content = await fs.readFile(swPath, 'utf8');
      } catch (error) {
            console.error(`[verify-firebase-sw] missing file: public/firebase-messaging-sw.js (${error.message})`);
            process.exit(1);
      }

      const missingMarkers = requiredMarkers.filter((marker) => !content.includes(marker));
      if (missingMarkers.length > 0) {
            console.error('[verify-firebase-sw] generated file is invalid: missing required Firebase markers');
            process.exit(1);
      }

      const placeholders = content.match(placeholderPattern);
      if (placeholders && placeholders.length > 0) {
            console.error(`[verify-firebase-sw] placeholders still present: ${[...new Set(placeholders)].join(', ')}`);
            process.exit(1);
      }

      console.log('[verify-firebase-sw] ok: generated file exists and placeholders are resolved');
}

main().catch((error) => {
      console.error('[verify-firebase-sw] failed:', error);
      process.exit(1);
});
