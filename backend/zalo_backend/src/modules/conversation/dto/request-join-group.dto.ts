import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestJoinGroupDto {
    @IsString()
    @IsOptional()
    @MaxLength(500)
    message?: string;
}
