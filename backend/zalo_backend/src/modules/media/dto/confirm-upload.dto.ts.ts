// src/modules/media/dto/confirm-upload.dto.ts
import { IsString, Length } from 'class-validator';

export class ConfirmUploadDto {
  @IsString()
  @Length(20, 36) // CUID length range
  uploadId: string;
}
// // src/modules/media/dto/confirm-upload.dto.ts

// import { IsUUID, IsString, IsOptional } from 'class-validator';
// import { ApiProperty } from '@nestjs/swagger';

// export class ConfirmUploadDto {
//   @ApiProperty({
//     description: 'Media ID from request response',
//     example: '123e4567-e89b-12d3-a456-426614174000',
//   })
//   @IsUUID()
//   mediaId: string;

//   @ApiProperty({
//     description: 'ETag from S3 upload response',
//     example: '"33a64df551425fcc55e4d42a148795d9f25f89d4"',
//   })
//   @IsString()
//   s3ETag: string;

//   @ApiProperty({
//     description: 'Optional checksum for verification',
//     required: false,
//   })
//   @IsString()
//   @IsOptional()
//   checksum?: string;
// }
