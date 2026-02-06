import { Permission } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

export class PermissionEntity implements Permission {
  // Map các field từ Prisma Schema
  @Expose()
  id: string;

  @Expose()
  name: string; // VD: "CREATE_USER"

  @Expose()
  apiPath: string; // VD: "/api/v1/users" - Quan trọng để FE check route

  @Expose()
  method: string; // VD: "POST" - Quan trọng để FE check hành động

  @Expose()
  module: string; // VD: "USER_MANAGEMENT" - Để FE ẩn/hiện menu

  // Ẩn các trường Audit không cần thiết cho Frontend
  @Exclude()
  createdAt: Date;
  @Exclude()
  updatedAt: Date;
  @Exclude()
  deletedAt: Date | null;
  @Exclude()
  createdById: string | null;
  @Exclude()
  updatedById: string | null;
  @Exclude()
  deletedById: string | null;

  constructor(partial: Partial<PermissionEntity>) {
    Object.assign(this, partial);
  }
}
