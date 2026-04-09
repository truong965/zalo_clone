import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DeviceFingerprintService } from 'src/modules/auth/services/device-fingerprint.service';

@Injectable()
export class DeviceFingerprintInterceptor implements NestInterceptor {
  constructor(private readonly deviceFingerprintService: DeviceFingerprintService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    // 1. Get or create a tracking ID (Cookie/Header based)
    const trackingId = this.deviceFingerprintService.getOrCreateTrackingId(request, response);

    // 2. Extract full device details
    const deviceInfo = this.deviceFingerprintService.extractDeviceInfo(request);

    // 3. Ensure deviceId is set to the trackingId
    deviceInfo.deviceId = trackingId;

    // 4. Attach to request for @GetDeviceInfo() decorator
    request.deviceInfo = deviceInfo;

    return next.handle();
  }
}
