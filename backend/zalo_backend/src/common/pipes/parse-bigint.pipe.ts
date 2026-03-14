import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';

/**
 * MSG-R4: Custom pipe to safely parse BigInt from string params.
 * Usage: @Param('messageId', ParseBigIntPipe) messageId: bigint
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string, metadata: ArgumentMetadata): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(
        `Invalid ${metadata.data ?? 'parameter'} format: expected a numeric string`,
      );
    }
  }
}
