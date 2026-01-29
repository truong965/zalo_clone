import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  Logger,
  Inject,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WsException } from '@nestjs/websockets';
import type { ConfigType } from '@nestjs/config';
import socketConfig from 'src/config/socket.config';
import { safeStringify } from 'src/common/utils/json.util';

@Injectable()
export class WsValidationPipe implements PipeTransform<any> {
  constructor(
    @Inject(socketConfig.KEY)
    private readonly config: ConfigType<typeof socketConfig>,
  ) {}
  private readonly logger = new Logger(WsValidationPipe.name);

  async transform(value: any, { metatype }: ArgumentMetadata) {
    // 1. Nếu không có DTO (metatype) hoặc là kiểu dữ liệu nguyên thủy -> Bỏ qua
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // 2. Chuyển đổi Plain Object sang Class Instance
    const object = plainToInstance(metatype, value);

    // 3. Thực hiện Validate
    const errors = await validate(object, {
      whitelist: true, // Tự động loại bỏ các field không khai báo trong DTO (Security)
      forbidNonWhitelisted: true, // Báo lỗi nếu gửi thừa field rác
    });

    if (errors.length > 0) {
      // 4. Format lỗi để trả về Client
      const messages = errors.map((error) => {
        return {
          field: error.property,
          errors: Object.values(error.constraints || {}),
        };
      });

      this.logger.warn(`Validation failed: ${safeStringify(messages)}`);

      // 5. Ném WsException (Filter của bạn sẽ bắt và gửi về client)
      throw new WsException({
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ',
        details: messages,
      });
    }

    return object;
  }

  // Helper: Kiểm tra xem có cần validate không
  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
