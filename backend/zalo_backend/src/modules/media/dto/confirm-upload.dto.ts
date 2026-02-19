// src/modules/media/dto/confirm-upload.dto.ts
import { IsString, Length } from 'class-validator';

export class ConfirmUploadDto {
  @IsString()
  @Length(20, 36) // CUID length range
  uploadId: string;
}
