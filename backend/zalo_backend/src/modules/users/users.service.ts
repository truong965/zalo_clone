import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ACCOUNT_PURGE_QUEUE, PURGE_USER_DATA } from './constants/purge-queue.constant';

import { User, UserStatus } from '@prisma/client';
import { BaseService, PrismaDelegate } from 'src/common/base/base.service';
import { UserEntity } from './entities/user.entity';
import bcrypt from 'bcryptjs';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { UserProfileEntity } from './entities/user-profile.entity';
import { PermissionEntity } from '../permissions/entity/permission.entity';
import { EventPublisher } from '@shared/events';
import { UserRegisteredEvent } from '@modules/auth/events';
import { UserProfileUpdatedEvent, UserEmailUpdatedEvent } from './events/user.events';
import { RedisService } from '@shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { UserSecurityLockService } from 'src/shared/redis/services/user-security-lock.service';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InternalEventNames } from 'src/common/contracts/events';
import type { AuthSecurityRevokedEvent } from '@modules/auth/listeners/security-event.handler';
import { PhoneNumberUtil } from 'src/common/utils/phone-number.util';
import { InteractionAuthorizationService } from '../authorization/services/interaction-authorization.service';

@Injectable()
export class UsersService extends BaseService<User> {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
    private readonly redis: RedisService,
    private readonly securityLock: UserSecurityLockService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(ACCOUNT_PURGE_QUEUE) private readonly purgeQueue: Queue,
    private readonly interactionAuth: InteractionAuthorizationService,
  ) {
    super(prisma.extended.user as unknown as PrismaDelegate<User>);
  }

  getHashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, 10);
  };
  /**
   *Find user by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email },
    });
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**Get user profile without password
   */
  async getProfile(id: string): Promise<UserProfileEntity> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true, // Lấy full object permission [cite: 40]
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Map Permissions: Chuyển từ RolePermission[] sang PermissionEntity[]
    const permissions =
      user.role?.rolePermissions.map(
        (rp) => new PermissionEntity(rp.permission), // Map toàn bộ object permission
      ) || [];

    // 3. Trả về Profile Entity
    return new UserProfileEntity({
      ...user,
      hasTotpSecret: !!user.twoFactorSecret,
      role: user.role?.name || 'UNKNOWN', // Tên role
      permissions: permissions, // Danh sách object permission đầy đủ
    });
  }

  async getPublicProfile(id: string, requesterId: string) {
    const profile = await this.getProfile(id);
    const areFriends = await this.interactionAuth.areFriends(requesterId, id);
    const isSelf = requesterId === id;
    
    return {
      user: {
        id: profile.id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        phoneNumber: profile.phoneNumber,
        gender: profile.gender,
        dateOfBirth: profile.dateOfBirth,
      },
      showSensitive: isSelf || areFriends,
    };
  }

  async isValidPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async checkExistPhone(phoneNumber: string) {
    const exist = await this.prisma.extended.user.findUnique({
      where: { phoneNumber },
    });
    if (exist) throw new BadRequestException('Số điện thoại đã tồn tại');
  }

  private async checkExistEmail(email: string) {
    const exist = await this.prisma.extended.user.findFirst({
      where: { email },
    });
    if (exist) throw new BadRequestException('Email đã tồn tại');
  }

  async register(dto: CreateUserDto): Promise<UserEntity> {
    await this.checkExistPhone(dto.phoneNumber);
    if (dto.email) {
      await this.checkExistEmail(dto.email);
    }

    // Tìm Role mặc định là 'USER'
    const userRole = await this.prisma.extended.role.findUnique({
      where: { name: 'USER' },
    });
    if (!userRole)
      throw new BadRequestException('Hệ thống chưa cấu hình Role USER');

    const passwordHash = await this.getHashPassword(dto.password);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userRestData } = dto;

    const newUser = await super.create({
      ...userRestData,
      passwordHash,
      roleId: userRole.id,
      status: UserStatus.ACTIVE,
      phoneNumberHash: PhoneNumberUtil.hash(dto.phoneNumber),
    });

    // Emit domain event for stats counters & downstream listeners
    await this.eventPublisher
      .publish(
        new UserRegisteredEvent(
          newUser.id,
          newUser.phoneNumber,
          newUser.displayName,
        ),
        { fireAndForget: true },
      )
      .catch((err) => {
        this.logger.warn(`Failed to emit UserRegisteredEvent: ${err.message}`);
      });

    return new UserEntity(newUser);
  }

  async createByAdmin(dto: CreateUserAdminDto): Promise<UserEntity> {
    await this.checkExistPhone(dto.phoneNumber);

    // Validate Role có tồn tại không
    const roleExist = await this.prisma.extended.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!roleExist) throw new BadRequestException('Role ID không tồn tại');

    const passwordHash = await this.getHashPassword(dto.password);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userRestData } = dto;
    const newUser = await super.create({
      ...userRestData,
      passwordHash,
      // roleId lấy từ DTO do Admin truyền
      status: UserStatus.ACTIVE,
      phoneNumberHash: PhoneNumberUtil.hash(dto.phoneNumber),
    });

    return new UserEntity(newUser);
  }
  async findAll(page: number, limit: number, qs: string) {
    // 1. Lấy kết quả thô từ BaseService
    const { meta, data } = await super.findAll(page, limit, qs);

    // 2. Map dữ liệu sang UserEntity (để áp dụng @Exclude)
    const entities = data.map((item) => new UserEntity(item));

    // 3. Trả về đúng cấu trúc PagePaginatedResult
    return {
      meta,
      data: entities, // Key phải là 'data', không phải 'result'
    };
  }
  async findOne(id: string) {
    const user = await super.findOne(id);
    return new UserEntity(user);
  }
  async update(id: string, dto: UpdateUserDto) {
    // Nếu đổi email -> Check trùng (trừ chính nó)
    const currentUser = await this.prisma.extended.user.findUnique({
      where: { id },
    });
    if (!currentUser) throw new NotFoundException('Người dùng không tồn tại');

    const isEmailChanging = dto['email'] && dto['email'] !== currentUser.email;

    if (isEmailChanging) {
      throw new ForbiddenException(
        'Vui lòng sử dụng tính năng "Thay đổi Email" trong phần Cài đặt bảo mật để cập nhật email của bạn.',
      );
    }

    const executeUpdate = async () => {
      // BaseService update sẽ gọi prisma update
      const updatedUser = await super.update(id, dto);

      // Invalidate JWT profile cache
      await this.redis.del(RedisKeyBuilder.authUserProfile(id));

      await this.eventPublisher
        .publish(
          new UserProfileUpdatedEvent(id, {
            displayName: dto.displayName,
            email: currentUser.email ?? undefined, // Convert null to undefined for type safety
            avatarUrl: dto.avatarUrl,
            bio: dto.bio,
            gender: dto.gender,
            dateOfBirth: dto.dateOfBirth,
          }),
          { fireAndForget: true },
        )
        .catch((err) => {
          this.logger.warn(
            `Failed to emit UserProfileUpdatedEvent: ${err.message}`,
          );
        });

      return new UserEntity(updatedUser);
    };
    return executeUpdate();
  }
  async updateByAdmin(
    id: string,
    dto: UpdateUserAdminDto,
  ): Promise<UserEntity> {
    // 1. Kiểm tra User có tồn tại không
    const currentUser = await this.findOne(id); // Đã map Entity, nhưng ta cần raw data để check logic
    // Lưu ý: Hàm findOne của BaseService trả về User (raw) nên ok.
    // Nếu bạn đã override findOne trả về Entity thì nên dùng this.prisma.extended.user.findUnique ở đây.

    // 2. Identify if sensitive fields are changing
    const isSensitiveChange =
      (dto.phoneNumber && dto.phoneNumber !== currentUser.phoneNumber) ||
      (dto.email && dto.email !== (currentUser as any).email) ||
      dto.password;

    const executeAdminUpdate = async () => {
      // Logic riêng cho từng trường nhạy cảm
      if (dto.phoneNumber && dto.phoneNumber !== currentUser.phoneNumber) {
        const duplicate = await this.prisma.extended.user.findUnique({
          where: { phoneNumber: dto.phoneNumber },
        });
        if (duplicate)
          throw new BadRequestException(
            'Số điện thoại mới đã tồn tại trên hệ thống',
          );
      }

      if (dto.email && dto.email !== (currentUser as any).email) {
        const duplicate = await this.prisma.extended.user.findFirst({
          where: { email: dto.email },
        });
        if (duplicate)
          throw new BadRequestException('Email mới đã tồn tại trên hệ thống');
      }

      if (dto.roleId) {
        const roleExist = await this.prisma.extended.role.findUnique({
          where: { id: dto.roleId },
        });
        if (!roleExist) throw new BadRequestException('Role ID không tồn tại');
      }

      let passwordHash: string | undefined = undefined;
      if (dto.password) {
        passwordHash = await this.getHashPassword(dto.password);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...restData } = dto;

      const updatedUser = await this.prisma.extended.user.update({
        where: { id },
        data: {
          ...restData,
          ...(passwordHash && { passwordHash }),
          // Increment password version if password changed by ADMIN
          ...(passwordHash && { passwordVersion: { increment: 1 } }),
        },
      });

      await this.redis.del(RedisKeyBuilder.authUserProfile(id));

      return new UserEntity(updatedUser);
    };

    if (isSensitiveChange) {
      return this.securityLock.runWithLock(id, executeAdminUpdate);
    }

    return executeAdminUpdate();
  }

  /**
   * Remove user with security lock and password validation
   */
  override async remove(id: string, password?: string) {
    const user = await this.findById(id);

    // If password is provided, verify it (for self-deletion)
    // If not provided, we assume it's an admin action (permission check in controller)
    if (password) {
      const isPasswordValid = await this.isValidPassword(
        password,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new BadRequestException('Mật khẩu không chính xác');
      }
    }

    return this.securityLock.runWithLock(id, async () => {
      try {
        const now = new Date();
        // 1. Synchronously anonymize PII with state check (Must not be already deleted)
        // By adding 'status: { not: UserStatus.DELETED }' in the where clause, 
        // we ensure we don't act on an already deleted record.
        await this.prisma.user.update({
          where: { 
            id,
            status: { not: UserStatus.DELETED }
          },
          data: {
            phoneNumber: `DEL_${now.getTime()}`,
            email: null,
            displayName: 'Người dùng Zalo',
            avatarUrl: null,
            bio: null,
            dateOfBirth: null,
            phoneNumberHash: null,
            status: UserStatus.DELETED,
            deletedAt: now,
          },
        });

        // 2. Revoke all sessions and disconnect sockets
        this.eventEmitter.emit(InternalEventNames.AUTH_SECURITY_REVOKED, {
          userId: id,
          reason: 'ACCOUNT_DELETED',
        } as AuthSecurityRevokedEvent);

        // 3. Invalidate cache
        await this.redis.del(RedisKeyBuilder.authUserProfile(id));

        // 4. Enqueue background job to purge the rest of the user's data
        await this.purgeQueue.add(
          PURGE_USER_DATA,
          { userId: id, deletedAt: now },
          { jobId: `purge-${id}` } // Prevent duplicate jobs
        );
      } catch (error) {
        // P2025: Record to update not found (conditional where failed)
        if (error.code === 'P2025') {
          throw new BadRequestException('Tài khoản đã được xóa trước đó.');
        }
        throw error;
      }
    });
  }

  /**
   * Deactivate account (status = INACTIVE)
   */
  async deactivateAccount(id: string, dto: DeactivateAccountDto) {
    const user = await this.findById(id);

    // Requirement: Check for email before deactivation
    if (!user.email) {
      throw new BadRequestException(
        'Vui lòng liên kết email trước khi thực hiện vô hiệu hóa tài khoản.',
      );
    }

    // Verify password
    const isPasswordValid = await this.isValidPassword(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu không chính xác');
    }

    return this.securityLock.runWithLock(id, async () => {
      try {
        const updatedUser = await this.prisma.user.update({
          where: { 
            id,
            status: UserStatus.ACTIVE // Only allow deactivating ACTIVE accounts
          },
          data: { status: UserStatus.INACTIVE },
        });

        // Revoke all sessions and disconnect sockets
        this.eventEmitter.emit(InternalEventNames.AUTH_SECURITY_REVOKED, {
          userId: id,
          reason: 'ACCOUNT_DEACTIVATED',
        } as AuthSecurityRevokedEvent);

        // Invalidate cache
        await this.redis.del(RedisKeyBuilder.authUserProfile(id));

        return updatedUser;
      } catch (error) {
        if (error.code === 'P2025') {
          throw new BadRequestException(
            'Không thể khóa tài khoản. Tài khoản đang ở trạng thái không hợp lệ hoặc đã bị xóa.',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Internal method for secure email updates (called by Auth module)
   */
  async updateEmailInternal(id: string, newEmail: string) {
    await this.checkExistEmail(newEmail);

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { email: newEmail },
    });

    // Invalidate cache
    await this.redis.del(RedisKeyBuilder.authUserProfile(id));

    // Emit event
    this.eventPublisher.publish(new UserEmailUpdatedEvent(id, newEmail));

    return updatedUser;
  }
}
