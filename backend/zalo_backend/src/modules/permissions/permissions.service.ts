import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService, PrismaDelegate } from 'src/common/base/base.service';
import { Permission } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService extends BaseService<Permission> {
  constructor(private prisma: PrismaService) {
    super(prisma.extended.permission as unknown as PrismaDelegate<Permission>);
  }

  // --- HELPER CHECK TRÙNG LẶP ---
  private async checkUniqueConstraint(
    apiPath: string,
    method: string,
    module: string,
    excludeId?: string, // Dùng cho update (để không check chính nó)
  ) {
    // Tìm xem có permission nào trùng cả 3 field không
    const exist = await this.prisma.extended.permission.findFirst({
      where: {
        apiPath,
        method,
        module,
        // Nếu là update -> loại trừ ID hiện tại ra
        id: excludeId ? { not: excludeId } : undefined,
      },
    });

    if (exist) {
      throw new BadRequestException(
        `Permission với ApiPath='${apiPath}', Method='${method}', Module='${module}' đã tồn tại!`,
      );
    }
  }

  // 1. CREATE
  async create(dto: CreatePermissionDto) {
    // Check trùng 3 fields
    await this.checkUniqueConstraint(dto.apiPath, dto.method, dto.module);

    // Check trùng Name (vì schema có @unique ở name)
    const existName = await this.prisma.extended.permission.findUnique({
      where: { name: dto.name },
    });
    if (existName)
      throw new BadRequestException(
        `Permission với tên ${dto.name} đã tồn tại`,
      );

    return super.create(dto);
  }

  // 2. UPDATE
  async update(id: string, dto: UpdatePermissionDto) {
    // Bước 1: Lấy data cũ từ DB để so sánh
    const currentPermission = await this.findOne(id); // Hàm này có sẵn trong BaseService

    // Bước 2: Merge data cũ và mới để có bộ 3 field hoàn chỉnh
    // Nếu dto không gửi apiPath lên, thì dùng apiPath cũ
    const newApiPath = dto.apiPath ?? currentPermission.apiPath;
    const newMethod = dto.method ?? currentPermission.method;
    const newModule = dto.module ?? currentPermission.module;

    // Bước 3: Chỉ check nếu có sự thay đổi ít nhất 1 trong 3 trường
    const isChanged =
      newApiPath !== currentPermission.apiPath ||
      newMethod !== currentPermission.method ||
      newModule !== currentPermission.module;

    if (isChanged) {
      await this.checkUniqueConstraint(newApiPath, newMethod, newModule, id);
    }

    // Check trùng name nếu có đổi tên
    if (dto.name && dto.name !== currentPermission.name) {
      const existName = await this.prisma.extended.permission.findUnique({
        where: { name: dto.name },
      });
      if (existName)
        throw new BadRequestException(
          `Permission với tên ${dto.name} đã tồn tại`,
        );
    }

    // Bước 4: Update
    return super.update(id, dto);
  }
}
