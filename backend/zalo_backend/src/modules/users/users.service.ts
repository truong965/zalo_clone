import {
  BadRequestException,
  Injectable,
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

@Injectable()
export class UsersService extends BaseService<User> {
  constructor(private prisma: PrismaService) {
    super(prisma.extended.user as unknown as PrismaDelegate<User>);
  }

  getHashPassword = (password: string) => {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  };
  /**
   *Find user by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
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
  async getProfile(id: string) {
    const user = await this.findById(id);
    return new UserEntity(user);
  }
  //helper check pass an toàn
  isValidPassword(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash);
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

    const passwordHash = this.getHashPassword(dto.password);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userRestData } = dto;

    const newUser = await super.create({
      ...userRestData,
      passwordHash,
      roleId: userRole.id,
      status: UserStatus.ACTIVE,
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

    const passwordHash = this.getHashPassword(dto.password);
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
      passwordHash = this.getHashPassword(dto.password);
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

    return new UserEntity(updatedUser);
  }
}
