import { UserEntity } from './user.entity';
import { Expose, Type } from 'class-transformer';
import { PermissionEntity } from 'src/modules/permissions/entity/permission.entity';

export class UserProfileEntity extends UserEntity {
  @Expose()
  role: string; // Vẫn giữ là String tên Role (VD: 'ADMIN') theo ý bạn

  @Expose()
  @Type(() => PermissionEntity) // Bắt buộc dòng này để class-transformer hiểu nested object
  permissions: PermissionEntity[];

  constructor(partial: Partial<UserProfileEntity>) {
    super(partial);
    Object.assign(this, partial);
  }
}
