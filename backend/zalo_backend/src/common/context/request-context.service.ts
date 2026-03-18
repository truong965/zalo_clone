import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  AuthenticatedRequestContext,
  REQUEST_CONTEXT_KEYS,
  RequestContextStore,
} from '@common/contracts/request-context';

interface RoleLike {
  name: string;
}

@Injectable()
export class RequestContextService {
  constructor(private readonly cls: ClsService<RequestContextStore>) { }

  setRequestId(requestId: string): void {
    try {
      this.cls.set(REQUEST_CONTEXT_KEYS.REQUEST_ID, requestId);
    } catch (error) {
      // CLS context not available - this is safe to ignore for now
      // as the requestId is mainly used for logging/tracing in the request context
      if (
        error instanceof Error &&
        error.message.includes('No CLS context available')
      ) {
        // Silently skip - CLS is not available in this context
        return;
      }
      throw error;
    }
  }

  getRequestId(): string | undefined {
    return this.cls.get(REQUEST_CONTEXT_KEYS.REQUEST_ID);
  }

  setAuthenticatedUser(context: AuthenticatedRequestContext): void {
    this.cls.set(REQUEST_CONTEXT_KEYS.USER_ID, context.userId);

    if (context.sessionId) {
      this.cls.set(REQUEST_CONTEXT_KEYS.SESSION_ID, context.sessionId);
    }

    if (context.deviceId) {
      this.cls.set(REQUEST_CONTEXT_KEYS.DEVICE_ID, context.deviceId);
    }

    const normalizedRoles = this.normalizeRoles(context.roles);
    if (normalizedRoles.length > 0) {
      this.cls.set(REQUEST_CONTEXT_KEYS.ROLES, normalizedRoles);
    }
  }

  getUserId(): string | undefined {
    return this.cls.get(REQUEST_CONTEXT_KEYS.USER_ID);
  }

  getRequiredUserId(): string {
    return this.requireContextValue(
      this.getUserId(),
      'Missing authenticated user in request context',
    );
  }

  getRoles(): string[] {
    return this.cls.get(REQUEST_CONTEXT_KEYS.ROLES) ?? [];
  }

  getSessionId(): string | undefined {
    return this.cls.get(REQUEST_CONTEXT_KEYS.SESSION_ID);
  }

  getRequiredSessionId(): string {
    return this.requireContextValue(
      this.getSessionId(),
      'Missing session id in request context',
    );
  }

  getDeviceId(): string | undefined {
    return this.cls.get(REQUEST_CONTEXT_KEYS.DEVICE_ID);
  }

  getRequiredDeviceId(): string {
    return this.requireContextValue(
      this.getDeviceId(),
      'Missing device id in request context',
    );
  }

  private normalizeRoles(roles: unknown): string[] {
    if (!Array.isArray(roles)) {
      return [];
    }

    return roles
      .map((role) => {
        if (typeof role === 'string') {
          return role;
        }

        if (this.isRoleLike(role)) {
          return role.name;
        }

        return null;
      })
      .filter((role): role is string => Boolean(role));
  }

  private isRoleLike(value: unknown): value is RoleLike {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const role = value as Record<string, unknown>;
    return typeof role.name === 'string';
  }

  private requireContextValue(
    value: string | undefined,
    message: string,
  ): string {
    if (!value) {
      throw new UnauthorizedException(message);
    }

    return value;
  }
}
