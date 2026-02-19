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
