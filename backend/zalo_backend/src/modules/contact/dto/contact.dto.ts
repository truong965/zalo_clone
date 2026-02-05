import {
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsArray,
  IsOptional,
  IsPhoneNumber,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactItemDto {
  @ApiProperty({ description: 'Số điện thoại từ danh bạ (Raw)' })
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('VN', {
    message: 'phoneNumber must be a valid phone number (e.g. 09xxx or +849xxx)',
  })
  phoneNumber: string;

  @ApiPropertyOptional({ description: 'Tên gợi nhớ trong danh bạ' })
  @IsString()
  @IsOptional()
  aliasName?: string;
}

export class SyncContactsDto {
  @ApiProperty({ type: [ContactItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactItemDto)
  contacts: ContactItemDto[];
}

export class ContactResponseDto {
  @ApiProperty()
  id: string; // UserContact ID

  @ApiProperty()
  contactUserId: string;

  @ApiProperty()
  displayName: string; // Resolved name (Alias > Real Name)

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiPropertyOptional()
  aliasName?: string; // Raw alias

  @ApiProperty()
  isFriend: boolean;

  @ApiPropertyOptional()
  lastSeenAt?: Date;
}

export class UpdateContactAliasDto {
  @ApiPropertyOptional({ description: 'Tên gợi nhớ trong danh bạ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  aliasName: string;
}
