import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { safeJSON } from '../utils/json.util';

export interface WsResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable()
export class WsTransformInterceptor<T> implements NestInterceptor<
  T,
  WsResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>, // Thêm <T> vào đây để biết đầu vào là T
  ): Observable<WsResponse<T>> {
    return next.handle().pipe(
      map((data): WsResponse<T> => {
        // Khai báo kiểu trả về rõ ràng cho hàm map
        const safeData = safeJSON(data);
        // Nếu data đã đúng chuẩn WsResponse (tránh wrap 2 lần)
        if (
          safeData &&
          typeof safeData === 'object' &&
          'success' in safeData &&
          'data' in safeData
        ) {
          return safeData as unknown as WsResponse<T>;
        }

        // Chuẩn hóa dữ liệu
        return {
          success: true,
          data: safeData,
        };
      }),
    );
  }
}
