import { Exclude } from 'class-transformer';
import { Gender, User, UserStatus } from '@prisma/client';

export class UserEntity implements User {
  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }

  // ==============================
  // 1. Identity & Contact Info
  // ==============================
  id: string;

  phoneNumber: string;

  phoneCode: string; // Mặc định +84 từ DB, nhưng entity nhận value thực tế

  // 🔒 BẢO MẬT: Hash này dùng để sync danh bạ phía server.
  // Không nên trả về client để tránh lộ vector tấn công brute-force số điện thoại.
  @Exclude()
  phoneNumberHash: string | null;
  phoneNumberNormalized: string | null;
  // ==============================
  // 2. Public Profile
  // ==============================
  displayName: string;

  avatarUrl: string | null;

  bio: string | null;

  dateOfBirth: Date | null;

  gender: Gender | null;

  status: UserStatus;

  // ==============================
  // 3. Security & Activity
  // ==============================

  // 🔒 BẢO MẬT: Luôn ẩn Password Hash
  @Exclude()
  passwordHash: string;

  // 🔒 BẢO MẬT: Ẩn version, field này dùng để revoke token khi user đổi pass/logout all
  @Exclude()
  passwordVersion: number;

  lastSeenAt: Date | null;

  // 🔹 ID của thiết bị đang gửi request (Lấy trực tiếp từ Access Token Payload)
  // Non-persistent field, only exists in req.user
  currentDeviceId?: string;

  // Non-persistent field, only exists in req.user for session-bound operations
  currentSessionId?: string;

  // ==============================
  // 4. Authorization (RBAC)
  // ==============================
  roleId: string | null;

  // ==============================
  // 5. Audit Trails
  // ==============================
  createdById: string | null;
  updatedById: string | null;
  deletedById: string | null;

  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;

  /**
   * ⚠️ LƯU Ý VỀ RELATIONSHIPS:
   * Class này `implements User` (Prisma Scalar Interface), nghĩa là nó chỉ chứa các cột trong bảng.
   * Các quan hệ (Relations) như `devices`, `tokens`, `messages` KHÔNG nên khai báo ở đây
   * để tránh vòng lặp vô tận (Circular Dependency) khi serialize JSON.
   * * Nếu cần trả về User kèm Relations, hãy tạo các class kế thừa hoặc DTO riêng, ví dụ:
   * export class UserWithRoleEntity extends UserEntity { role: RoleEntity }
   */
}
