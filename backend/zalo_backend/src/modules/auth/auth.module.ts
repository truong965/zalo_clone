// import { Module } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { PassportModule } from '@nestjs/passport';
// import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { AuthController } from './auth.controller';
// import { RolesModule } from 'src/modules/roles/roles.module';
// import { PermissionsModule } from '../permissions/permissions.module';
// import { UsersModule } from '../users/users.module';
// import { JwtStrategy } from './strategies/jwt.strategy';
// @Module({
//   imports: [
//     UsersModule,
//     PassportModule,
//     RolesModule,
//     PermissionsModule,
//     JwtModule.registerAsync({
//       imports: [ConfigModule],
//       useFactory: (configService: ConfigService) => {
//         return {
//           secret: configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
//           signOptions: {
//             expiresIn: configService.get<string>(
//               'JWT_ACCESS_EXPIRE',
//             ) as JwtSignOptions['expiresIn'],
//           },
//         };
//       },
//       inject: [ConfigService],
//     }),
//   ],
//   providers: [AuthService, LocalStrategy, JwtStrategy],
//   controllers: [AuthController],
//   exports: [AuthService, JwtStrategy],
// })
// export class AuthModule {}
import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { UsersModule } from '../users/users.module';
import jwtConfig from '../../config/jwt.config';
import { SocialModule } from '../social/social.module';
import { CallModule } from '../call/call.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configuration handled in strategies
    ConfigModule.forFeature(jwtConfig),
    UsersModule,
    forwardRef(() => SocialModule),
    forwardRef(() => CallModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    DeviceFingerprintService,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService, TokenService, DeviceFingerprintService],
})
export class AuthModule {}
