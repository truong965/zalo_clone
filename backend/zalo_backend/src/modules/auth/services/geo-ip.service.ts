import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as maxmind from 'maxmind';
import { CityResponse } from 'maxmind';
import * as path from 'path';
import * as fs from 'fs';

export interface GeoLocation {
  city?: string;
  country?: string;
  countryCode?: string;
  fullLocation?: string;
}

@Injectable()
export class GeoIpService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpService.name);
  private lookup: maxmind.Reader<CityResponse> | null = null;

  async onModuleInit() {
    // We expect the GeoLite2-City.mmdb to be placed in the "data" folder at the project root
    const dbPath = path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb');
    
    try {
      if (fs.existsSync(dbPath)) {
        this.lookup = await maxmind.open<CityResponse>(dbPath);
        this.logger.log(`GeoLite2-City database loaded successfully from ${dbPath}`);
      } else {
        this.logger.warn(
          `GeoLite2-City database NOT FOUND at ${dbPath}. ` +
          `GeoIP lookups will return unknown locations. ` +
          `Please download it from MaxMind and place it in the "data" directory.`
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to load GeoLite2-City database: ${error.message}`);
    }
  }

  lookupIp(ipAddress: string): GeoLocation {
    if (!this.lookup || !ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1') {
      return { fullLocation: 'Local/Unknown' };
    }

    try {
      const result = this.lookup.get(ipAddress);
      
      if (!result) {
        return { fullLocation: 'Unknown Location' };
      }

      const city = result.city?.names?.en;
      const country = result.country?.names?.en;
      const countryCode = result.country?.iso_code;

      const locationParts: string[] = [];
      if (city) locationParts.push(city);
      if (country) locationParts.push(countryCode || country);
      
      const fullLocation = locationParts.length > 0 ? locationParts.join(', ') : 'Unknown Location';

      return {
        city,
        country,
        countryCode,
        fullLocation
      };
    } catch (error: any) {
      this.logger.error(`Error looking up IP ${ipAddress}: ${error.message}`);
      return { fullLocation: 'Unknown Location' };
    }
  }
}
