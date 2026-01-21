// // src/types/express.d.ts
// import { User } from '@prisma/client';
// import { DeviceInfo } from 'src/modules/auth/interfaces/device-info.interface';

// declare global {
//   namespace Express {
//     interface Request {
//       user?: User & { refreshToken?: string }; // User từ DB + refreshToken (nếu có)
//       cookies: { [key: string]: string }; // Cho cookie-parser
//       deviceInfo?: DeviceInfo; // Cho DeviceFingerprintService
//     }
//   }
// }
