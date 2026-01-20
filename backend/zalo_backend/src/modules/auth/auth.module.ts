import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { LocalStrategy } from './passport/local.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './passport/jwt.strategy';
import { AuthController } from './auth.controller';
import { RolesModule } from 'src/modules/roles/roles.module';
import { PermissionsModule } from 'src/permissions/permissions.module';
@Module({
  imports: [
    UsersModule,
    PassportModule,
    RolesModule,
    PermissionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
          signOptions: {
            expiresIn: configService.get<string>(
              'JWT_ACCESS_EXPIRE',
            ) as JwtSignOptions['expiresIn'],
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
