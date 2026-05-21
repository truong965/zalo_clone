import {
  IsArray,
  IsOptional,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';

export class VotePollDto {
  /** Toggle vote for a single option (tap voted option to unvote). */
  @IsOptional()
  @IsUUID()
  toggleOptionId?: string;

  /** Submit selected options via "Bình chọn" button. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  optionIds?: string[];
}
