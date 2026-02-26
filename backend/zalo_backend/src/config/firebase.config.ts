import { registerAs } from '@nestjs/config';

export default registerAs('firebase', () => ({
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      // Restore literal newlines from the escaped \n in .env
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

      // Note: VAPID keys are NOT needed on the backend.
      // Firebase Admin SDK handles push via FCM server-side.
      // The VAPID public key is only used on the frontend as
      // the `vapidKey` param in FCM's getToken() call.
}));
