import { registerAs } from '@nestjs/config';

export default registerAs('s3', () => ({
  endpoint: process.env.S3_ENDPOINT || undefined,
  bucketName: process.env.S3_BUCKET_NAME || 'zalo-clone-media-dev',
  region: process.env.AWS_REGION || 'ap-southeast-1',
  // When running on EC2 with an IAM Instance Profile, leave both vars unset
  // so the SDK falls back to the instance metadata credential provider.
  // When set (IAM User or local dev with MinIO), explicit creds are used.
  credentials: {
    accessKeyId:
      process.env.MINIO_ROOT_USER || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey:
      process.env.MINIO_ROOT_PASSWORD ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      '',
  },
  cloudFront: {
    domain: process.env.CLOUDFRONT_DOMAIN || '',
    // S3 key prefix for all avatar objects.
    // CloudFront origin path must be left as '/' (default) so the full path
    // including this prefix is forwarded to S3 unchanged.
    avatarPrefix: 'avatars/',
  },
  forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO; false for real S3
}));
