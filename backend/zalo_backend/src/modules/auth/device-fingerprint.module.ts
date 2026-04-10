import { Module } from '@nestjs/common';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { GeoIpService } from './services/geo-ip.service';

@Module({
  providers: [DeviceFingerprintService, GeoIpService],
  exports: [DeviceFingerprintService, GeoIpService],
})
export class DeviceFingerprintModule {}
