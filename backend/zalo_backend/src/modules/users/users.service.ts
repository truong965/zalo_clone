import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

import { User } from '@prisma/client';
import { BaseService, PrismaDelegate } from 'src/common/base/base.service';
import { UserEntity } from './entities/user.entity';
import bcrypt from 'bcryptjs';

@Injectable()
export class UsersService extends BaseService<User> {
  constructor(private prisma: PrismaService) {
    super(prisma.extended.user as unknown as PrismaDelegate<User>);
  }

  getHashPassword = (password: string) => {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  };
  // 1. TẠO USER MỚI
  async create(dto: CreateUserDto): Promise<UserEntity> {
    // Check trùng SĐT
    const existUser = await this.prisma.extended.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existUser) throw new BadRequestException('Số điện thoại đã tồn tại');

    // Hash Password
    const passwordHash = this.getHashPassword(dto.password);
    // Lưu DB
    const newUser = await super.create({
      ...dto,
      passwordHash,
      // DateOfBirth đã được convert nhờ DTO @Type(() => Date), không cần new Date()
      // BaseService nhận "any" nên dto truyền vào thoải mái
    });

    return new UserEntity(newUser);
  }

  // 2. LẤY DANH SÁCH (Chỉ lấy Active)
  async findAll(page: number, limit: number, qs: string) {
    return super.findAll(page, limit, qs);
  }
}
