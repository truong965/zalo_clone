import { IsBoolean, IsUUID } from 'class-validator';

export class ReviewJoinRequestDto {
  @IsUUID()
  requestId: string;

  @IsBoolean()
  approve: boolean; // true = approve, false = reject
}
