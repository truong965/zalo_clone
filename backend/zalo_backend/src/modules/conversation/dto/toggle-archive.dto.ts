import { IsBoolean } from 'class-validator';

export class ToggleArchiveDto {
  @IsBoolean()
  archived: boolean;
}
