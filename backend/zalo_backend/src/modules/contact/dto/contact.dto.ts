import {
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsArray,
  IsOptional,
  IsPhoneNumber,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactSource } from '@prisma/client';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { NormalizePhone } from 'src/common/decorator/normalize-phone.decorator';

export class ContactItemDto {
  @ApiPropertyOptional({
    description: 'Phone number hash (SHA-256) - Recommended for privacy',
  })
  @IsOptional()
  @IsString()
  phoneHash?: string;

  @ApiPropertyOptional({
    description: 'Tên hiển thị từ danh bạ điện thoại (phone book name)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  phoneBookName?: string;
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
  displayName: string; // Resolved name: aliasName > phoneBookName > realName

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Tên gợi nhớ do người dùng đặt thủ công',
  })
  aliasName?: string;

  @ApiPropertyOptional({
    description: 'Tên từ danh bạ điện thoại (phone sync)',
  })
  phoneBookName?: string;

  @ApiProperty({
    enum: ContactSource,
    description: 'Nguồn tạo contact: MANUAL hoặc PHONE_SYNC',
  })
  source: ContactSource;

  @ApiProperty()
  isFriend: boolean;

  @ApiProperty({ description: 'Cả hai cùng lưu số của nhau' })
  isMutual: boolean;

  @ApiPropertyOptional()
  lastSeenAt?: Date;
}

export class UpdateContactAliasDto {
  @ApiPropertyOptional({
    description:
      'Tên gợi nhớ trong danh bạ. Truyền null hoặc bỏ qua để xoá alias (reset về tên thật)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  aliasName?: string | null;
}

// --- QUERY DTO for GET /contacts ---

export class GetContactsQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo tên gợi nhớ, tên danh bạ, hoặc tên hiển thị',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Khi true: chỉ trả về contacts chưa phải bạn bè (loại bỏ overlap)',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === undefined)
  @IsBoolean()
  excludeFriends?: boolean = true;
}
