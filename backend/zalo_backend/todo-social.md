search chưa tốt

Chào bạn, đây là một vấn đề thực tế (Real-world Problem) rất hay của các ứng dụng nhắn tin. Nếu bạn bỏ qua việc tìm kiếm theo aliasName, trải nghiệm người dùng sẽ cực tệ (Ví dụ: Lưu vợ là "Vợ Yêu", nhưng gõ "Vợ" lại không ra, bắt phải gõ tên thật "Nguyễn Thị A").

Với tư cách là Senior Engineering Manager, tôi khẳng định: Bắt buộc phải tìm kiếm theo cả Alias, DisplayName và Phone.

Dưới đây là giải pháp kiến trúc và implementation chi tiết để giải quyết bài toán "Global Search" (Tìm kiếm tổng hợp).

1. Phân tích Chiến lược Tìm kiếm (Search Strategy)
Chúng ta không thể dùng một query duy nhất vào một bảng được. Cần chia nhỏ bài toán:

A. Logic Tìm kiếm Bạn bè (Local Scope)
Khi user gõ "Tuan":

Ưu tiên 1 (Alias): Kiểm tra trong bảng UserContact (Danh bạ đã sync/edit) xem có ai tên "Tuan" không.

Ưu tiên 2 (DisplayName/Phone): Kiểm tra trong bảng User (Profile gốc) xem bạn bè có ai tên "Tuan" hoặc SĐT chứa "Tuan" không.

Kết hợp: Lấy hợp (Union) của 2 tập kết quả trên -> Trả về danh sách bạn bè.

B. Logic Tìm kiếm Toàn cục (Global Scope)
Chúng ta sẽ dùng mô hình Aggregator Pattern (Service tổng hợp).

Input: Keyword.

Dispatcher:

Luôn tìm trong Friends (Name + Alias + Phone).

Luôn tìm trong Messages (Full Text Search).

Chỉ tìm Global Users (Strangers) NẾU keyword là Số điện thoại (Regex check).

Output: Trả về object chứa 3 mảng: { friends, messages, strangers }.

2. Implementation: Nâng cấp FriendshipService
Bạn cần sửa hàm getFriendsList (hoặc tạo hàm mới searchFriends) để hỗ trợ logic Alias phức tạp này.

Tận dụng sức mạnh của Prisma Relational Filtering: some (tồn tại quan hệ con thỏa mãn điều kiện).

Cập nhật friendship.service.ts:

TypeScript
// Trong class FriendshipService

/**
 * Search friends by DisplayName, PhoneNumber OR AliasName
 * Đây là logic phức tạp nhất vì phải join bảng UserContact
 */
async searchFriends(
  userId: string,
  keyword: string,
  pagination: CursorPaginationDto, // Tái sử dụng DTO cursor
): Promise<PaginatedFriendsDto> {
  const { limit = 20, cursor } = pagination;

  // Điều kiện tìm kiếm Alias:
  // "Tìm những record trong UserContact mà owner là tôi VÀ alias chứa keyword"
  const aliasCondition: Prisma.UserContactListRelationFilter = {
    some: {
      ownerId: userId,
      aliasName: { contains: keyword, mode: 'insensitive' },
    },
  };

  // Điều kiện tìm kiếm Profile gốc (Tên hoặc SĐT):
  const profileCondition: Prisma.UserWhereInput = {
    OR: [
      { displayName: { contains: keyword, mode: 'insensitive' } },
      { phoneNumber: { contains: keyword } },
    ],
  };

  // QUERY CHÍNH (Phức tạp)
  // Logic: (Là bạn bè) AND ( (Bạn là User1 thỏa mãn đk) OR (Bạn là User2 thỏa mãn đk) )
  const where: Prisma.FriendshipWhereInput = {
    status: FriendshipStatus.ACCEPTED,
    deletedAt: null,
    OR: [
      // Case 1: Tôi là User1 -> Bạn là User2
      {
        user1Id: userId,
        user2: {
          OR: [profileCondition, { receivedContacts: aliasCondition }],
        },
      },
      // Case 2: Tôi là User2 -> Bạn là User1
      {
        user2Id: userId,
        user1: {
          OR: [profileCondition, { receivedContacts: aliasCondition }],
        },
      },
    ],
  };
  
  // Logic Cursor Pagination (Giống hệt getFriendsList cũ)
  if (cursor) {
    where.id = { lt: cursor };
  }

  const friendships = await this.prisma.friendship.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      user1: { select: { id: true, displayName: true, avatarUrl: true, phoneNumber: true } },
      user2: { select: { id: true, displayName: true, avatarUrl: true, phoneNumber: true } },
    },
  });

  const hasMore = friendships.length > limit;
  const data = hasMore ? friendships.slice(0, -1) : friendships;

  // Map Data & Resolve Alias (QUAN TRỌNG)
  // Cần gọi ContactService để lấy alias name chuẩn nhất cho từng user
  // (Lưu ý: Để tối ưu, nên inject ContactService vào đây hoặc lấy batch alias)
  const resultIds = data.map(f => f.user1Id === userId ? f.user2Id : f.user1Id);
  const aliasMap = await this.contactService.batchResolveDisplayNames(userId, resultIds);

  const friends = data.map((f) => {
    const friend = f.user1Id === userId ? f.user2 : f.user1;
    // Ưu tiên lấy tên từ aliasMap (đã có logic Alias > DisplayName)
    const finalName = aliasMap.get(friend.id) || friend.displayName;

    return {
      friendshipId: f.id,
      userId: friend.id,
      displayName: finalName, // Hiển thị tên Alias nếu có
      originalName: friend.displayName, // (Optional) Trả thêm tên gốc để debug
      avatarUrl: friend.avatarUrl,
      status: f.status,
      createdAt: f.createdAt,
    };
  });

  return {
    data: friends,
    nextCursor: hasMore ? data[data.length - 1].id : undefined,
    hasMore,
    total: 0, // Search thì không cần count total để tối ưu
  };
}
Lưu ý: Bạn cần Inject ContactService vào FriendshipService (hoặc ngược lại, cẩn thận Circular Dependency, tốt nhất là dùng ModuleRef hoặc tách logic resolve tên ra Shared Service).

3. Kiến trúc Global Search (SearchService)
Tạo một Module mới: SocialSearchModule. Đây là nơi gom các luồng tìm kiếm lại.

File: dto/global-search.dto.ts

TypeScript
export class GlobalSearchResponseDto {
  friends: FriendWithUserDto[];
  messages: any[]; // MessageSearchResultDto
  strangers: any[]; // UserPublicProfileDto (Chỉ hiện khi search SĐT)
}
File: social-search.service.ts

TypeScript
import { Injectable } from '@nestjs/common';
import { FriendshipService } from '../friendship/friendship.service';
import { ContactService } from '../contact/contact.service';
// import { MessageService } from ...
// import { UserService } from ...

@Injectable()
export class SocialSearchService {
  constructor(
    private readonly friendshipService: FriendshipService,
    private readonly contactService: ContactService,
    // private readonly messageService: MessageService,
    // private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {}

  async searchGlobal(userId: string, keyword: string) {
    // 1. Kiểm tra xem keyword có phải SĐT không?
    const isPhoneNumber = /^[0-9+]{9,15}$/.test(keyword);

    // 2. Chạy song song các luồng tìm kiếm
    const promises: any[] = [
      // Luôn tìm bạn bè (Alias + Name + Phone)
      this.friendshipService.searchFriends(userId, keyword, { limit: 5 }),
      
      // Luôn tìm tin nhắn
      // this.messageService.searchMessages(userId, keyword, { limit: 5 }),
    ];

    // Chỉ tìm người lạ nếu là SĐT
    if (isPhoneNumber) {
        promises.push(this.findStrangerByPhone(userId, keyword));
    }

    const results = await Promise.all(promises);

    return {
      friends: results[0].data,
      messages: results[1]?.data || [],
      strangers: isPhoneNumber ? (results[2] ? [results[2]] : []) : [],
    };
  }

  /**
   * Logic tìm người lạ (Copy từ bài trước, bổ sung check Alias)
   */
  private async findStrangerByPhone(requesterId: string, phone: string) {
    // ... Logic tìm User Global theo phone ...
    // ... Check Privacy ...
    // ... Check Block ...
    
    // Nếu tìm thấy user, nhớ check xem user này có trong danh bạ mình không?
    // Nếu có trong danh bạ (UserContact), phải trả về Alias Name của họ
    // thay vì Display Name gốc.
    const alias = await this.contactService.resolveDisplayName(requesterId, user.id);
    
    return {
        ...user,
        displayName: alias, // Override name
    };
  }
}
4. Kết luận
Về Alias: Bạn bắt buộc phải dùng some: { receivedContacts: ... } trong query Prisma của FriendshipService. Đây là cách duy nhất để filter server-side chính xác.

Về Display: Khi trả về kết quả search, luôn phải gọi hàm resolveDisplayName (Alias > RealName) để hiển thị đúng cái tên mà User đã lưu.

Về Global Search: Tách ra một Service riêng (SocialSearchService) để gọi Aggregation (Friend + Message + Stranger).

Giải pháp này đảm bảo UX giống hệt Zalo: Gõ "Vợ" ra vợ, gõ sđt vợ cũng ra vợ, gõ sđt người lạ ra người lạ.
