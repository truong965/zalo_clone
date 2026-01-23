import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService, PrismaDelegate } from 'src/common/base/base.service'; // Dùng path của bạn
import { PrismaService } from 'src/database/prisma.service'; // Dùng path của bạn
import { Friendship, FriendshipStatus } from '@prisma/client';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { UpdateFriendshipDto } from './dto/update-friendship.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class FriendshipsService extends BaseService<Friendship> {
  constructor(
    private prisma: PrismaService,
    private readonly cls: ClsService,
    // private readonly socketService: SocketService,
  ) {
    super(prisma.extended.friendship as unknown as PrismaDelegate<Friendship>);
  }

  /**
   * Override Create: Xử lý logic gửi lời mời kết bạn
   */
  // async create(dto: CreateFriendshipDto) {
  //   const currentUserId = this.cls.get<string>('userId');
  //   const { toUserId } = dto;

  //   // 1. Validate cơ bản
  //   if (currentUserId === toUserId) {
  //     throw new BadRequestException('Không thể kết bạn với chính mình');
  //   }

  //   // 2. Kiểm tra User đích có tồn tại không
  //   const targetUser = await this.prisma.extended.user.findUnique({
  //     where: { id: toUserId },
  //   });
  //   if (!targetUser) {
  //     throw new BadRequestException('User không tồn tại');
  //   }

  //   // 3. Sắp xếp user1 < user2 để đảm bảo unique constraint của DB
  //   // Luôn lưu user1Id là ID nhỏ hơn, user2Id là ID lớn hơn
  //   const [user1Id, user2Id] = [currentUserId, toUserId].sort();

  //   // 4. Check xem đã có record nào giữa 2 người chưa (bất kể ai gửi)
  //   // Dùng `this.prisma.friendship` (Client Gốc) thay vì `this.prisma.extended.friendship`
  //   // Lý do: Để đảm bảo bỏ qua mọi Middleware ẩn soft-delete (nếu sau này có thêm vào findUnique)
  //   const existingFriendship = await this.prisma.friendship.findUnique({
  //     where: {
  //       user1Id_user2Id: {
  //         user1Id,
  //         user2Id,
  //       },
  //     },
  //   });

  //   if (existingFriendship) {
  //     // Đã từng kết bạn nhưng đã xóa (Unfriend)-> Cần Restore
  //     if (existingFriendship.deletedAt) {
  //       return this.prisma.extended.friendship.update({
  //         where: { id: existingFriendship.id },
  //         data: {
  //           status: FriendshipStatus.PENDING, // Reset về trạng thái chờ
  //           requesterId: currentUserId, // Update người gửi yêu cầu mới
  //           deletedAt: null, // Khôi phục record
  //           deletedById: null, // Xóa dấu vết người xóa cũ
  //         },
  //       });
  //     }
  //     if (existingFriendship.status === FriendshipStatus.PENDING) {
  //       throw new BadRequestException('Đang có lời mời kết bạn chờ xử lý');
  //     }
  //     if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
  //       throw new BadRequestException('Hai người đã là bạn bè');
  //     }
  //     // Nếu trạng thái là DECLINED, có thể cho phép gửi lại (update).
  //     return this.prisma.extended.friendship.update({
  //       where: { id: existingFriendship.id },
  //       data: {
  //         status: FriendshipStatus.PENDING,
  //         requesterId: currentUserId, // Cập nhật người gửi yêu cầu mới nhất
  //       },
  //     });
  //   }

  //   // 5. Tạo mới
  //   const newFriendship = await this.prisma.extended.friendship.create({
  //     data: {
  //       user1Id,
  //       user2Id,
  //       requesterId: currentUserId,
  //       status: FriendshipStatus.PENDING,
  //     },
  //   });
  //   // --- REAL-TIME NOTIFICATION ---
  //   // Gửi sự kiện cho người nhận (toUserId)
  //   // Payload nên chứa thông tin người gửi để Client hiển thị ngay (Avatar, Tên)
  //   const senderInfo = await this.prisma.user.findUnique({
  //     where: { id: currentUserId },
  //     select: { id: true, displayName: true, avatarUrl: true },
  //   });
  //   this.socketService.emitToUser(
  //     dto.toUserId, // Gửi tới người B
  //     SOCKET_EVENTS.FRIEND_REQUEST_RECEIVED,
  //     {
  //       friendshipId: newFriendship.id,
  //       sender: senderInfo,
  //       timestamp: new Date(),
  //     },
  //   );

  //   return newFriendship;
  // }

  /**
   * Override Update: Xử lý chấp nhận/từ chối
   */
  // async update(id: string, dto: UpdateFriendshipDto) {
  //   const currentUserId = this.cls.get<string>('userId');

  //   // Tìm friendship
  //   const friendship = await this.findOne(id);

  //   // Validate logic nghiệp vụ (Security)
  //   // Chỉ người NHẬN lời mời mới được phép Accept/Decline
  //   // Người GỬI chỉ được phép Cancel (Delete) -> Handle ở hàm remove
  //   if (
  //     friendship.requesterId === currentUserId &&
  //     (dto.status === FriendshipStatus.ACCEPTED ||
  //       dto.status === FriendshipStatus.DECLINED)
  //   ) {
  //     throw new BadRequestException(
  //       'Bạn không thể tự chấp nhận lời mời của chính mình',
  //     );
  //   }

  //   // Update status
  //   const updatedFriendship = await super.update(id, dto);
  //   // --- REAL-TIME NOTIFICATION ---
  //   // Nếu Accept -> Báo lại cho người gửi (Requester) biết
  //   if (dto.status === FriendshipStatus.ACCEPTED) {
  //     const accepterInfo = await this.prisma.user.findUnique({
  //       where: { id: currentUserId }, // Người vừa bấm chấp nhận
  //       select: { id: true, displayName: true, avatarUrl: true },
  //     });

  //     this.socketService.emitToUser(
  //       updatedFriendship.requesterId, // Gửi lại cho người A (người xin kết bạn)
  //       SOCKET_EVENTS.FRIEND_REQUEST_ACCEPTED,
  //       {
  //         friendshipId: updatedFriendship.id,
  //         accepter: accepterInfo,
  //         timestamp: new Date(),
  //       },
  //     );
  //   }
  //   return updatedFriendship;
  // }
}
