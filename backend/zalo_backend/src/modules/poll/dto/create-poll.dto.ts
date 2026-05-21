import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MAX_POLL_OPTIONS,
  MAX_POLL_OPTION_TEXT_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
} from '../constants/poll.constants';

export class CreatePollDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_POLL_QUESTION_LENGTH)
  question: string;

  @IsArray()
  @ArrayMinSize(MIN_POLL_OPTIONS)
  @ArrayMaxSize(MAX_POLL_OPTIONS)
  @IsString({ each: true })
  @MaxLength(MAX_POLL_OPTION_TEXT_LENGTH, { each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  isMultipleChoices?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAddOptions?: boolean;
}
