import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  Logger,
  Type,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WsException } from '@nestjs/websockets';
import { safeStringify } from 'src/common/utils/json.util';

type ValidationTarget = Type<object>;
type PrimitiveMetatype = Type<unknown>;

@Injectable()
export class WsValidationPipe implements PipeTransform<
  unknown,
  Promise<unknown>
> {
  private readonly logger = new Logger(WsValidationPipe.name);

  async transform(
    value: unknown,
    { metatype }: ArgumentMetadata,
  ): Promise<unknown> {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const target = metatype as ValidationTarget;
    const object = plainToInstance(target, value);

    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const messages = errors.map((error) => {
        return {
          field: error.property,
          errors: Object.values(error.constraints || {}),
        };
      });

      this.logger.warn(`Validation failed: ${safeStringify(messages)}`);

      throw new WsException({
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ',
        details: messages,
      });
    }

    return object;
  }

  private toValidate(metatype: PrimitiveMetatype): boolean {
    const types: PrimitiveMetatype[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
