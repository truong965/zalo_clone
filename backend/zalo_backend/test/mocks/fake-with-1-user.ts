import 'dotenv/config';

// Ensure DATABASE_URL is loaded before importing PrismaClient
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

import {
  PrismaClient,
  Prisma,
  UserStatus,
  MemberRole,
  MemberStatus,
  JoinRequestStatus,
  FriendshipStatus,
  ConversationType,
  MessageType,
  ReceiptStatus,
  PrivacyLevel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fakerVI as faker } from '@faker-js/faker';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ================= CONFIGURATION =================
const TARGET_PHONE = '0909000111';
const CONFIG = {
  TOTAL_USERS: 150, // Tổng user trong hệ thống (bao gồm target)
  TARGET_FRIENDS: 100, // Số bạn bè của user chính
  TARGET_CONVERSATIONS: 100, // Tổng số cuộc trò chuyện của user chính
  MESSAGES_PER_CONV: 100, // Số tin nhắn trong mỗi cuộc trò chuyện của user chính
  DEFAULT_PASSWORD_HASH:
    '$2b$10$pWCRXcgi/rS0K2zXgrJZOOuMkVI.IdfD6NyhkB6RjSHo99y1pYkhW',
};

// ================= HELPERS =================

async function cleanDatabase() {
  console.log('🗑️  Cleaning database...');
  // Xóa theo thứ tự để tránh lỗi khóa ngoại
  await prisma.messageReceipt.deleteMany();
  await prisma.mediaAttachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.groupJoinRequest.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.block.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Database cleaned');
}

async function createUsers() {
  console.log('👤 Creating users...');
  const usersData: Prisma.UserCreateManyInput[] = [];

  // 1. Tạo User chính (Target)
  usersData.push({
    phoneNumber: TARGET_PHONE,
    displayName: 'BOSS (Target User)',
    avatarUrl: 'https://i.pravatar.cc/300?u=target',
    passwordHash: CONFIG.DEFAULT_PASSWORD_HASH,
    bio: 'Account dùng để test full chức năng chat',
    status: UserStatus.ACTIVE,
    gender: 'MALE',
    lastSeenAt: new Date(),
  });

  // 2. Tạo các User phụ
  for (let i = 0; i < CONFIG.TOTAL_USERS - 1; i++) {
    const sex = faker.person.sexType();
    usersData.push({
      phoneNumber: faker.phone
        .number({ style: 'national' })
        .replace(/\D/g, '')
        .slice(0, 15),
      displayName: faker.person.fullName({ sex }),
      avatarUrl: faker.image.avatar(),
      passwordHash: CONFIG.DEFAULT_PASSWORD_HASH,
      bio: faker.lorem.sentence(5),
      status: UserStatus.ACTIVE,
      gender: sex.toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE',
      lastSeenAt: faker.date.recent(),
    });
  }

  await prisma.user.createMany({ data: usersData, skipDuplicates: true });

  // Lấy lại danh sách user có ID
  const allUsers = await prisma.user.findMany();
  const targetUser = allUsers.find((u) => u.phoneNumber === TARGET_PHONE);

  if (!targetUser) throw new Error('Failed to create target user');

  console.log(
    `✅ Created ${allUsers.length} users (Target ID: ${targetUser.id})`,
  );
  return { allUsers, targetUser };
}

async function createTargetFriendships(targetUser: any, otherUsers: any[]) {
  console.log(
    `🤝 Creating ${CONFIG.TARGET_FRIENDS} friendships for Target User...`,
  );

  // Lấy ngẫu nhiên user để làm bạn
  const friends = faker.helpers.arrayElements(
    otherUsers,
    CONFIG.TARGET_FRIENDS,
  );
  const friendshipsData: Prisma.FriendshipCreateManyInput[] = [];

  for (const friend of friends) {
    const [user1Id, user2Id] = [targetUser.id, friend.id].sort();
    friendshipsData.push({
      user1Id,
      user2Id,
      requesterId: targetUser.id,
      status: FriendshipStatus.ACCEPTED,
      createdAt: faker.date.past({ years: 1 }),
    });
  }

  await prisma.friendship.createMany({
    data: friendshipsData,
    skipDuplicates: true,
  });
  console.log(`✅ Created friendships`);
  return friends;
}

// Hàm giả lập block
async function simulateBlock(blockerId: string, blockedId: string) {
  await prisma.block.create({
    data: {
      blockerId,
      blockedId,
      createdAt: new Date(),
    },
  });
}

/**
 * LOGIC QUAN TRỌNG: Tạo tin nhắn và trạng thái đọc giả lập
 */
async function seedDetailedMessagesForConversation(
  conversationId: string,
  participants: any[], // Bao gồm cả targetUser
  targetUserId: string,
) {
  const messagesData: Prisma.MessageCreateManyInput[] = [];
  let currentTime = faker.date.past({ years: 0.5 }); // Bắt đầu từ 6 tháng trước

  // 1. Tạo 100 tin nhắn (chưa insert ngay để lấy ID sau)
  // Vì Prisma createMany không trả về ID (BigInt) trên Postgres cũ, ta sẽ insert từng batch nhỏ hoặc insert xong query lại.
  // Cách tốt nhất: Insert createMany -> Query lại theo created_at -> Xử lý receipt.

  for (let i = 0; i < CONFIG.MESSAGES_PER_CONV; i++) {
    const sender = faker.helpers.arrayElement(participants);

    // Tăng thời gian ngẫu nhiên (từ 10s đến 2 tiếng)
    currentTime = new Date(
      currentTime.getTime() + faker.number.int({ min: 10000, max: 7200000 }),
    );

    // Random message type
    const type = faker.helpers.arrayElement([
      MessageType.TEXT,
      MessageType.TEXT,
      MessageType.TEXT, // Ưu tiên Text
      MessageType.IMAGE,
      MessageType.STICKER,
    ]);

    let content = faker.lorem.sentence();
    if (type === MessageType.IMAGE) content = faker.image.url();
    if (type === MessageType.STICKER) content = 'sticker_url_123';

    // 5% tin nhắn bị xóa
    const isDeleted = faker.datatype.boolean(0.05);

    messagesData.push({
      conversationId,
      senderId: sender.id,
      type,
      content,
      clientMessageId: faker.string.uuid(),
      createdAt: currentTime,
      deletedAt: isDeleted ? new Date(currentTime.getTime() + 60000) : null,
      deletedById: isDeleted ? sender.id : null,
    });
  }

  // Insert Messages
  await prisma.message.createMany({ data: messagesData });

  // Lấy lại messages đã insert, sort theo thời gian để giả lập luồng đọc
  const createdMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, senderId: true, createdAt: true },
  });

  // 2. Xử lý Unread Count & Last Read cho từng member
  // Giả lập: Mỗi member sẽ đọc đến một vị trí ngẫu nhiên trong cuộc trò chuyện

  const receiptsData: Prisma.MessageReceiptCreateManyInput[] = [];

  for (const participant of participants) {
    // Random vị trí user này đã đọc tới.
    // - 80% trường hợp là đọc hết (index = length - 1)
    // - 20% là còn unread (index < length - 1)
    const isUpToDate = faker.datatype.boolean(0.8);
    let lastReadIndex = createdMessages.length - 1;

    if (!isUpToDate) {
      // Đọc tới tin thứ 50 -> 90 ngẫu nhiên
      lastReadIndex = faker.number.int({
        min: 50,
        max: createdMessages.length - 10,
      });
    }

    // Biến tính toán unread
    let unreadCount = 0;
    let lastReadMessageId = null;
    let lastReadAt = null;

    // Duyệt qua từng tin nhắn để tạo Receipt
    for (let i = 0; i < createdMessages.length; i++) {
      const msg = createdMessages[i];
      let status: ReceiptStatus = ReceiptStatus.SENT;

      // Logic Receipt
      if (msg.senderId === participant.id) {
        status = ReceiptStatus.SEEN; // Tin mình gửi thì coi như đã xem
      } else {
        if (i <= lastReadIndex) {
          status = ReceiptStatus.SEEN;
        } else {
          status = ReceiptStatus.DELIVERED; // Đã nhận nhưng chưa xem
          unreadCount++;
        }
      }

      // Tạo receipt
      receiptsData.push({
        messageId: msg.id,
        userId: participant.id,
        status,
        timestamp: new Date(msg.createdAt.getTime() + 1000), // Receipt sau tin nhắn 1s
      });

      // Cập nhật marker
      if (i === lastReadIndex) {
        lastReadMessageId = msg.id;
        lastReadAt = new Date(msg.createdAt.getTime() + 5000); // Đọc sau 5s
      }
    }

    // Update Conversation Member state
    // Lưu ý: prisma.conversationMember.update yêu cầu unique compound key
    await prisma.conversationMember.update({
      where: {
        conversationId_userId: { conversationId, userId: participant.id },
      },
      data: {
        lastReadMessageId: lastReadMessageId as any, // Cast vì BigInt type issue đôi khi xảy ra
        lastReadAt,
        unreadCount,
      },
    });
  }

  // Insert tất cả receipts (batch lớn)
  if (receiptsData.length > 0) {
    await prisma.messageReceipt.createMany({
      data: receiptsData,
      skipDuplicates: true,
    });
  }

  // Update Conversation Last Message
  const lastMsg = createdMessages[createdMessages.length - 1];
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: lastMsg.createdAt },
  });
}

async function createTargetConversations(targetUser: any, friends: any[]) {
  console.log(
    '💬 Creating Conversations & Messages (This may take a while)...',
  );

  // Chia tỷ lệ: 70 Direct, 30 Group
  const DIRECT_COUNT = 70;
  const GROUP_COUNT = 30;

  // --- 1. DIRECT CONVERSATIONS ---
  // Lấy 70 friends đầu tiên
  const directFriends = friends.slice(0, DIRECT_COUNT);

  for (const [index, friend] of directFriends.entries()) {
    console.log(`Processing Direct Conv ${index + 1}/${DIRECT_COUNT}...`);

    const conv = await prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        participants: [targetUser.id, friend.id],
        members: {
          create: [
            {
              userId: targetUser.id,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
            },
            {
              userId: friend.id,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
            },
          ],
        },
      },
    });

    // 5% cơ hội bị block
    if (faker.datatype.boolean(0.05)) {
      // Random ai block ai
      const isTargetBlocker = faker.datatype.boolean();
      if (isTargetBlocker) await simulateBlock(targetUser.id, friend.id);
      else await simulateBlock(friend.id, targetUser.id);
      console.log(`   -> Blocked relationship created for conv ${conv.id}`);
    }

    await seedDetailedMessagesForConversation(
      conv.id,
      [targetUser, friend],
      targetUser.id,
    );
  }

  // --- 2. GROUP CONVERSATIONS ---
  for (let i = 0; i < GROUP_COUNT; i++) {
    console.log(`Processing Group Conv ${i + 1}/${GROUP_COUNT}...`);

    // Chọn random 3-8 friends + targetUser
    const groupMembers = faker.helpers.arrayElements(
      friends,
      faker.number.int({ min: 3, max: 8 }),
    );
    const allMembers = [targetUser, ...groupMembers];

    // Random role của Target
    const isTargetAdmin = faker.datatype.boolean(0.7); // 70% là admin

    const conv = await prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: `Group: ${faker.commerce.productName()} Team`,
        avatarUrl: faker.image.urlLoremFlickr({ category: 'tech' }),
        members: {
          create: allMembers.map((u) => ({
            userId: u.id,
            role:
              u.id === targetUser.id && isTargetAdmin
                ? MemberRole.ADMIN
                : MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
          })),
        },
      },
    });

    // Edge case: Target User rời nhóm hoặc bị kick (5%)
    if (faker.datatype.boolean(0.05)) {
      const status = faker.helpers.arrayElement([
        MemberStatus.LEFT,
        MemberStatus.KICKED,
      ]);
      await prisma.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: conv.id,
            userId: targetUser.id,
          },
        },
        data: { status },
      });
      console.log(
        `   -> Target user status set to ${status} in group ${conv.id}`,
      );
    }

    await seedDetailedMessagesForConversation(
      conv.id,
      allMembers,
      targetUser.id,
    );
  }
}

async function main() {
  try {
    await prisma.$connect();
    console.log('🚀 Seeding START for Target User: ' + TARGET_PHONE);

    await cleanDatabase();

    // 1. Create Users
    const { targetUser, allUsers } = await createUsers();

    // 2. Create Friends (Target <-> Others)
    const otherUsers = allUsers.filter((u) => u.id !== targetUser.id);
    const friends = await createTargetFriendships(targetUser, otherUsers);

    // 3. Create Conversations & Full Messages History
    // (Direct & Group, Block, Delete, Unread Count logic included)
    await createTargetConversations(targetUser, friends);

    console.log('🎉 Seeding COMPLETED!');
    console.log('👉 Login with phone: 0909000111');
    console.log(
      '👉 Expectation: 100 Conversations, rich message history, unread badges.',
    );
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
