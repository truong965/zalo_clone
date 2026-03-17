import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

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
import { UserProfileUpdatedEvent } from './events/user.events';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

@Injectable()
export class UsersService extends BaseService<User> {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
    private readonly redis: RedisService,
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
      // include: {
      //   role: {
      //     include: {
      //       rolePermissions: {
      //         include: {
      //           permission: true,
      //         },
      //       },
      //     },
      //   },
      // },
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
      role: user.role?.name || 'UNKNOWN', // Tên role
      permissions: permissions, // Danh sách object permission đầy đủ
    });
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
  async register(dto: CreateUserDto): Promise<UserEntity> {
    await this.checkExistPhone(dto.phoneNumber);

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
    // BaseService update sẽ gọi prisma update
    // DTO đã chặn password/phoneNumber nên an toàn
    const updatedUser = await super.update(id, dto);

    // Invalidate JWT profile cache
    await this.redis.del(RedisKeyBuilder.authUserProfile(id));

    await this.eventPublisher
      .publish(
        new UserProfileUpdatedEvent(id, {
          displayName: dto.displayName,
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
  }
  async updateByAdmin(
    id: string,
    dto: UpdateUserAdminDto,
  ): Promise<UserEntity> {
    // 1. Kiểm tra User có tồn tại không
    const currentUser = await this.findOne(id); // Đã map Entity, nhưng ta cần raw data để check logic
    // Lưu ý: Hàm findOne của BaseService trả về User (raw) nên ok.
    // Nếu bạn đã override findOne trả về Entity thì nên dùng this.prisma.extended.user.findUnique ở đây.

    // 2. Xử lý Logic riêng cho từng trường nhạy cảm

    // A. Nếu đổi số điện thoại -> Check trùng (trừ chính nó)
    if (dto.phoneNumber && dto.phoneNumber !== currentUser.phoneNumber) {
      const duplicate = await this.prisma.extended.user.findUnique({
        where: { phoneNumber: dto.phoneNumber },
      });
      if (duplicate)
        throw new BadRequestException(
          'Số điện thoại mới đã tồn tại trên hệ thống',
        );
    }

    // B. Nếu đổi Role -> Check Role tồn tại
    if (dto.roleId) {
      const roleExist = await this.prisma.extended.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!roleExist) throw new BadRequestException('Role ID không tồn tại');
    }

    // C. Nếu đổi Password -> Hash lại
    let passwordHash: string | undefined = undefined;
    if (dto.password) {
      passwordHash = await this.getHashPassword(dto.password);
    }

    // 3. Thực hiện Update
    // Tách password raw ra khỏi object update
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...restData } = dto;

    const updatedUser = await this.prisma.extended.user.update({
      where: { id },
      data: {
        ...restData,
        ...(passwordHash && { passwordHash }),
      },
    });

    // Invalidate JWT profile cache
    await this.redis.del(RedisKeyBuilder.authUserProfile(id));

    return new UserEntity(updatedUser);
  }
}
