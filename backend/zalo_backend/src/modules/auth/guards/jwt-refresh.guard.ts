import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard to protect refresh token endpoint
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
