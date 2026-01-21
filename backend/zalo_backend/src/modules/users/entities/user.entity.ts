import { Exclude } from 'class-transformer';
import { Gender, User, UserStatus } from '@prisma/client';

export class UserEntity implements User {
  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }

  id: string;
  phoneNumber: string;
  phoneCode: string; // Schema có field này
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  status: UserStatus;

  roleId: string | null; // Schema cho phép null (lúc init)

  lastSeenAt: Date | null;

  // 🔒 BẢO MẬT: Luôn ẩn Password khi trả về
  @Exclude()
  passwordHash: string;
  @Exclude() // Ẩn đi, không trả về cho client
  passwordVersion: number;

  // Các trường Audit
  createdById: string | null;
  updatedById: string | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}
