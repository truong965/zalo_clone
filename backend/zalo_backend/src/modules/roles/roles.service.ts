import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService, PrismaDelegate } from 'src/common/base/base.service';
import { PrismaService } from 'src/database/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { Role } from '@prisma/client';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService extends BaseService<Role> {
  constructor(private prisma: PrismaService) {
    //Ép kiểu để khớp với Interface PrismaDelegate của BaseService
    super(prisma.extended.role as unknown as PrismaDelegate<Role>);
  }

  async checkNameRole(id?: string, name?: string) {
    if (!name) {
      throw new BadRequestException(`Tên Role không được để trống`);
    }
    const existRole = await this.prisma.extended.role.findFirst({
      where: { name, id: id ? { not: id } : undefined },
    });
    if (existRole) {
      throw new BadRequestException(`Role với tên "${name}" đã tồn tại`);
    }
  }
  //check trùng tên Role
  async create(dto: CreateRoleDto) {
    await this.checkNameRole(undefined, dto.name);
    const { permissions, ...roleData } = dto;
    return this.prisma.extended.role.create({
      data: {
        ...roleData,
        //Tạo luôn quan hệ trong bảng RolePermission
        rolePermissions: {
          create: permissions?.map((permissionId) => ({
            permissionId: permissionId,
            // roleId sẽ được Prisma tự điền sau khi tạo Role xong
          })),
        },
      },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.checkNameRole(id, dto.name);
    const { permissions, ...roleData } = dto;
    return this.prisma.extended.role.update({
      where: { id },
      data: {
        ...roleData,
        // Nếu có gửi permissions lên thì mới xử lý
        ...(permissions && {
          rolePermissions: {
            // Xóa hết quyền cũ của Role này
            deleteMany: {},
            //  Thêm lại quyền mới theo danh sách gửi lên
            create: permissions.map((permissionId) => ({
              permissionId: permissionId,
            })),
          },
        }),
      },
    });
  }
  async findOne(id: string) {
    const role = await this.prisma.extended.role.findUnique({
      where: { id },
      include: {
        // Include bảng trung gian
        rolePermissions: {
          include: {
            permission: true, // Include chi tiết Permission
          },
        },
      },
    });

    if (!role) throw new BadRequestException('Role not found');
    return role;
  }
}
