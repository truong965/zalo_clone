import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_POLL_OPTION_TEXT_LENGTH } from '../constants/poll.constants';

export class AddPollOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_POLL_OPTION_TEXT_LENGTH)
  text: string;
}
