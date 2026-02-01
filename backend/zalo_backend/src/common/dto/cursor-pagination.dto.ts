import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Số lượng items cần lấy (Mặc định 20, Tối đa 100)',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number) // Ép kiểu an toàn từ string query sang number
  @IsInt()
  @Min(1)
  @Max(100) // Quan trọng: Chặn user request quá lớn gây treo DB
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Cursor để lấy trang tiếp theo (ID của item cuối cùng trang trước)',
    example: 'uuid-v4-string',
  })
  @IsOptional()
  @IsString()
  // @IsUUID() -> Có thể bỏ IsUUID nếu sau này bạn dùng cursor là TimeStamp hoặc Base64
  cursor?: string;
}
