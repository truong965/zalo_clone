import { Exclude } from 'class-transformer';
import { Gender, User, UserStatus } from '@prisma/client';

export class UserEntity implements User {
  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }

  id: string;
  phoneNumber: string;
  phoneCode: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  status: UserStatus;
  roleId: string;
  lastSeenAt: Date | null;

  //Đánh dấu Exclude để NestJS tự động cắt bỏ password
  @Exclude()
  passwordHash: string;

  createdById: string | null;
  updatedById: string | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}
