import { registerAs } from '@nestjs/config';

export default registerAs('s3', () => ({
  endpoint: process.env.S3_ENDPOINT || undefined,
  bucketName: process.env.S3_BUCKET_NAME || 'zalo-clone-media-dev',
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  cloudFront: {
    domain: process.env.CLOUDFRONT_DOMAIN || '',
  },
  forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO
}));

// import { registerAs } from '@nestjs/config';

// export default registerAs('media', () => ({
//   // AWS
//   aws: {
//     region: process.env.AWS_REGION || 'ap-southeast-1',
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     s3: {
//       bucket: process.env.AWS_S3_BUCKET || 'chat-media-dev',
//       endpoint: process.env.AWS_S3_ENDPOINT,
//     },
//     cloudfront: {
//       domain: process.env.AWS_CLOUDFRONT_DOMAIN,
//       keyPairId: process.env.AWS_CLOUDFRONT_KEY_PAIR_ID,
//       privateKeyPath: process.env.AWS_CLOUDFRONT_PRIVATE_KEY_PATH,
//     },
//   },

//   // Upload Limits (bytes)
//   limits: {
//     image: {
//       maxSize: parseInt(process.env.MEDIA_MAX_IMAGE_SIZE, 10) || 10485760, // 10MB
//       allowedTypes: (
//         process.env.MEDIA_ALLOWED_IMAGE_TYPES ||
//         'image/jpeg,image/png,image/webp'
//       ).split(','),
//     },
//     video: {
//       maxSize: parseInt(process.env.MEDIA_MAX_VIDEO_SIZE, 10) || 52428800, // 50MB
//       allowedTypes: (
//         process.env.MEDIA_ALLOWED_VIDEO_TYPES || 'video/mp4,video/quicktime'
//       ).split(','),
//       maxDuration: 180, // 3 minutes
//     },
//     document: {
//       maxSize: parseInt(process.env.MEDIA_MAX_DOCUMENT_SIZE, 10) || 10485760, // 10MB
//       allowedTypes: (
//         process.env.MEDIA_ALLOWED_DOCUMENT_TYPES || 'application/pdf'
//       ).split(','),
//     },
//   },

//   // Rate Limiting
//   rateLimit: {
//     uploadRequestLimit: parseInt(process.env.MEDIA_UPLOAD_RATE_LIMIT, 10) || 10,
//     uploadRequestTtl: parseInt(process.env.MEDIA_UPLOAD_RATE_TTL, 10) || 60,
//   },

//   // Cleanup
//   cleanup: {
//     enabled: process.env.MEDIA_CLEANUP_ENABLED === 'true',
//     orphanDays: parseInt(process.env.MEDIA_CLEANUP_ORPHAN_DAYS, 10) || 7,
//     cronSchedule: process.env.MEDIA_CLEANUP_CRON || '0 2 * * *', // 2 AM daily
//   },

//   // ClamAV
//   clamav: {
//     enabled: process.env.CLAMAV_ENABLED === 'true',
//     host: process.env.CLAMAV_HOST || 'localhost',
//     port: parseInt(process.env.CLAMAV_PORT, 10) || 3310,
//   },

//   // Presigned URL
//   presignedUrl: {
//     expiresIn: 300, // 5 minutes
//   },
// }));
