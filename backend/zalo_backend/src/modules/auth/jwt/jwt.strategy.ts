// src/auth/passport/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IUser } from 'src/users/users.interface';
import { RolesService } from 'src/modules/roles/roles.service';
import mongoose from 'mongoose';
import { PermissionsService } from 'src/permissions/permissions.service';

export interface CachedPermission {
  _id: string | mongoose.Types.ObjectId;
  name: string;
  apiPath: string;
  method: string;
  module: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private roleService: RolesService,
    private permissionsService: PermissionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_TOKEN_SECRET')!,
    });
  }

  async validate(payload: IUser) {
    const { _id, name, email, role, company } = payload;

    // Type-safe casting
    const userRole = role as unknown as { _id: string; name: string };

    if (!userRole?._id) {
      return {
        _id,
        name,
        email,
        role,
        company,
        permissions: [],
      };
    }

    // Check cache first
    const cached = await this.permissionsService.getPermissions(userRole._id);
    if (cached) {
      return {
        _id,
        name,
        email,
        role,
        company,
        permissions: cached,
      };
    }

    // Query DB nếu cache miss
    try {
      const roleDoc = await this.roleService.findOne(userRole._id);
      const permissions = (roleDoc?.permissions ??
        []) as unknown as CachedPermission[];
      // Save to cache
      if (roleDoc) {
        await this.permissionsService.setPermissions(
          userRole._id,
          permissions as any[],
        );
      }
      return {
        _id,
        name,
        email,
        role,
        company,
        permissions,
      };
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      return {
        _id,
        name,
        email,
        role,
        company,
        permissions: [],
      };
    }
  }
}
