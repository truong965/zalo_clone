//npx dotenv -e .env.development.local -- npx tsx test/mocks/fake-with-1-user.ts
import 'dotenv/config';
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
      PrivacyLevel,
      Gender,
      MediaType,
      MediaProcessingStatus,
      User,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fakerVI as faker } from '@faker-js/faker';
import * as crypto from 'crypto';

// Ensure DATABASE_URL is loaded
if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ================= CONFIGURATION (GIỮ NGUYÊN) =================
const TARGET_PHONE = '+84987654321';
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
      // Xóa theo thứ tự phụ thuộc khóa ngoại ngược
      await prisma.mediaAttachment.deleteMany();
      await prisma.message.deleteMany();
      await prisma.groupJoinRequest.deleteMany();
      await prisma.conversationMember.deleteMany();
      await prisma.conversation.deleteMany();
      await prisma.userContact.deleteMany(); // [NEW]
      await prisma.block.deleteMany();
      await prisma.friendship.deleteMany();
      await prisma.privacySettings.deleteMany(); // [NEW]
      await prisma.rolePermission.deleteMany(); // [NEW]
      await prisma.role.deleteMany(); // [NEW]
      await prisma.user.deleteMany();
      console.log('✅ Database cleaned');
}

/**
 * 1. Tạo Users và Privacy Settings
 */
async function createUsers(): Promise<{ allUsers: User[], targetUser: User }> {
      console.log('👤 Creating users & Privacy Settings...');
      const usersData: any[] = [];
      const privacyData: any[] = [];

      // 1.1 Tạo User chính (Target)
      const targetId = faker.string.uuid(); // Pre-generate ID để link Privacy
      usersData.push({
            id: targetId,
            phoneNumber: TARGET_PHONE,
            phoneCode: '+84',
            phoneNumberHash: crypto.createHash('sha256').update(TARGET_PHONE).digest('hex'),
            displayName: 'BOSS (Target User)',
            avatarUrl: 'https://i.pravatar.cc/300?u=target',
            passwordHash: CONFIG.DEFAULT_PASSWORD_HASH,
            bio: 'Account dùng để test full chức năng chat Enterprise',
            status: UserStatus.ACTIVE,
            gender: Gender.MALE,
            dateOfBirth: new Date('1995-01-01'),
            lastSeenAt: new Date(),
      });

      privacyData.push({
            userId: targetId,
            showProfile: PrivacyLevel.EVERYONE,
            whoCanMessageMe: PrivacyLevel.EVERYONE,
            whoCanCallMe: PrivacyLevel.EVERYONE,
            showOnlineStatus: true,
            showLastSeen: true,
      });

      // 1.2 Tạo các User phụ (Friends + Strangers)
      for (let i = 0; i < CONFIG.TOTAL_USERS - 1; i++) {
            const userId = faker.string.uuid();
            const sex = faker.person.sexType();
            const rawPhoneSuffix = faker.string.numeric(9);
            const normalizedPhone = `+84${rawPhoneSuffix}`;

            usersData.push({
                  id: userId,
                  phoneNumber: normalizedPhone,
                  phoneCode: '+84',
                  phoneNumberHash: crypto.createHash('sha256').update(normalizedPhone).digest('hex'),
                  displayName: faker.person.fullName({ sex }),
                  avatarUrl: faker.image.avatar(),
                  passwordHash: CONFIG.DEFAULT_PASSWORD_HASH,
                  bio: faker.lorem.sentence(5),
                  status: UserStatus.ACTIVE,
                  gender: sex.toUpperCase() === 'MALE' ? Gender.MALE : Gender.FEMALE,
                  dateOfBirth: faker.date.birthdate({ min: 18, max: 60, mode: 'age' }),
                  lastSeenAt: faker.date.recent(),
            });

            // Random Privacy Settings
            privacyData.push({
                  userId: userId,
                  showProfile: faker.helpers.enumValue(PrivacyLevel),
                  whoCanMessageMe: faker.helpers.enumValue(PrivacyLevel), // Có người chặn tin nhắn người lạ
                  whoCanCallMe: faker.helpers.enumValue(PrivacyLevel),
                  showOnlineStatus: faker.datatype.boolean(),
                  showLastSeen: faker.datatype.boolean(),
            });
      }

      // 1.3 Create Roles
      console.log('🛡️ Creating Roles...');
      const adminRole = await prisma.role.create({
            data: {
                  name: 'ADMIN',
                  description: 'System Administrator',
            },
      });
      const userRole = await prisma.role.create({
            data: {
                  name: 'USER',
                  description: 'Regular User',
            },
      });

      // 1.4 Assign Role IDs
      usersData.forEach((u) => {
            if (u.phoneNumber === TARGET_PHONE) {
                  u.roleId = adminRole.id;
            } else {
                  u.roleId = userRole.id;
            }
      });

      // Create Users
      await prisma.user.createMany({ data: usersData, skipDuplicates: true });
      // Create Privacy Settings
      await prisma.privacySettings.createMany({ data: privacyData, skipDuplicates: true });

      // Fetch back objects
      const allUsers = await prisma.user.findMany();
      const targetUser = allUsers.find((u) => u.phoneNumber === TARGET_PHONE);

      if (!targetUser) throw new Error('Failed to create target user');

      console.log(
            `✅ Created ${allUsers.length} users and privacy settings.`,
      );
      return { allUsers, targetUser };
}

/**
 * 2. Tạo User Contacts (Shadow Graph) - Danh bạ
 */
async function createUserContacts(targetUser: User, allUsers: User[]) {
      console.log('📒 Creating User Contacts (Shadow Graph)...');
      const contactsData: Prisma.UserContactCreateManyInput[] = [];

      // Target lưu khoảng 50 người vào danh bạ (bao gồm cả friend và chưa friend)
      const usersInContact = faker.helpers.arrayElements(allUsers.filter(u => u.id !== targetUser.id), 50);

      for (const contact of usersInContact) {
            contactsData.push({
                  ownerId: targetUser.id,
                  contactUserId: contact.id,
                  aliasName: faker.datatype.boolean(0.3) ? `Alias: ${faker.person.firstName()}` : null, // 30% có đặt tên gợi nhớ
                  createdAt: faker.date.past(),
            });
      }

      await prisma.userContact.createMany({ data: contactsData, skipDuplicates: true });
      console.log(`✅ Created ${contactsData.length} contacts for Target User.`);
}

/**
 * 3. Tạo Friendships (Đúng quy tắc user1Id < user2Id)
 */
async function createTargetFriendships(targetUser: User, otherUsers: User[]): Promise<User[]> {
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
            // QUY TẮC SCHEMA: user1Id < user2Id
            const [u1, u2] = [targetUser.id, friend.id].sort();

            friendshipsData.push({
                  user1Id: u1,
                  user2Id: u2,
                  requesterId: friend.id, // Giả lập họ add mình
                  status: FriendshipStatus.ACCEPTED,
                  createdAt: faker.date.past({ years: 1 }),
                  lastActionAt: new Date(),
                  lastActionBy: targetUser.id,
            });
      }

      // Tạo thêm vài request đang PENDING (Người lạ add Target)
      const strangers = otherUsers.filter(u => !friends.includes(u));
      const pendingRequests = faker.helpers.arrayElements(strangers, 5);
      for (const stranger of pendingRequests) {
            const [u1, u2] = [targetUser.id, stranger.id].sort();
            friendshipsData.push({
                  user1Id: u1,
                  user2Id: u2,
                  requesterId: stranger.id,
                  status: FriendshipStatus.PENDING,
                  createdAt: new Date(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Het han sau 7 ngay
            });
      }

      await prisma.friendship.createMany({
            data: friendshipsData,
            skipDuplicates: true,
      });
      console.log(`✅ Created friendships & requests.`);
      return friends; // Chỉ trả về list đã là bạn bè
}

/**
 * 4. Hàm giả lập Block
 */
async function simulateBlock(blockerId: string, blockedId: string) {
      await prisma.block.create({
            data: {
                  blockerId,
                  blockedId,
                  reason: faker.lorem.sentence(),
                  createdAt: new Date(),
            },
      });
}

/**
 * 5. LOGIC QUAN TRỌNG: Messages, Media, Reply, Receipts
 */
async function seedDetailedMessagesForConversation(
      conversationId: string,
      participants: User[],
      targetUserId: string,
) {
      const messagesData: Prisma.MessageCreateManyInput[] = [];
      let currentTime = faker.date.past({ years: 0.5 });

      // Giữ lại ID của các tin nhắn Text để làm reply
      // Vì createMany không trả ID, ta sẽ tạo message trước, sau đó query lại để gắn Media

      // Simulation Loop
      for (let i = 0; i < CONFIG.MESSAGES_PER_CONV; i++) {
            const sender = faker.helpers.arrayElement(participants);
            currentTime = new Date(currentTime.getTime() + faker.number.int({ min: 10000, max: 7200000 }));

            // Weighted Random Types
            const type = faker.helpers.weightedArrayElement([
                  { weight: 70, value: MessageType.TEXT },
                  { weight: 15, value: MessageType.IMAGE },
                  { weight: 5, value: MessageType.VIDEO },
                  { weight: 5, value: MessageType.FILE },
                  { weight: 5, value: MessageType.STICKER },
            ]);

            let content: string | null = faker.lorem.sentence();
            if (type === MessageType.STICKER) content = 'sticker_cat_pack_01';
            if (type !== MessageType.TEXT && type !== MessageType.STICKER) content = null; // Content null nếu là file thuần

            // Metadata JSON
            const metadata: Prisma.InputJsonValue = type === MessageType.TEXT ? { mentions: [] } : {};

            const isDeleted = faker.datatype.boolean(0.05);

            messagesData.push({
                  conversationId,
                  senderId: sender.id,
                  type,
                  content,
                  metadata,
                  clientMessageId: faker.string.uuid(),
                  createdAt: currentTime,
                  deletedAt: isDeleted ? new Date(currentTime.getTime() + 60000) : null,
                  deletedById: isDeleted ? sender.id : null,
                  updatedById: null,
            });
      }

      // 5.1 Insert Messages
      await prisma.message.createMany({ data: messagesData });

      // 5.2 Fetch back messages to handle Media & Receipts & Replies
      const createdMessages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
      });

      const mediaData: Prisma.MediaAttachmentCreateManyInput[] = [];
      const updates: any[] = []; // Promises for updating replies

      for (let i = 0; i < createdMessages.length; i++) {
            const msg = createdMessages[i];

            // --- A. Create Media Attachments if needed ---
            if (msg.type === MessageType.IMAGE || msg.type === MessageType.VIDEO || msg.type === MessageType.FILE) {
                  const mediaTypeMap = {
                        [MessageType.IMAGE]: MediaType.IMAGE,
                        [MessageType.VIDEO]: MediaType.VIDEO,
                        [MessageType.FILE]: MediaType.DOCUMENT,
                  };

                  mediaData.push({
                        messageId: msg.id, // BigInt
                        uploadedBy: msg.senderId!,
                        originalName: faker.system.fileName(),
                        mimeType: msg.type === MessageType.IMAGE ? 'image/jpeg' : 'application/pdf',
                        mediaType: mediaTypeMap[msg.type as keyof typeof mediaTypeMap] || MediaType.IMAGE,
                        size: BigInt(faker.number.int({ min: 1024, max: 10485760 })), // 1KB - 10MB
                        s3Key: `uploads/${conversationId}/${msg.id}_${faker.string.alphanumeric(10)}`,
                        s3Bucket: 'chat-app-bucket-dev',
                        cdnUrl: faker.image.url(),
                        processingStatus: MediaProcessingStatus.READY,
                        width: msg.type === MessageType.IMAGE ? 1920 : null,
                        height: msg.type === MessageType.IMAGE ? 1080 : null,
                        duration: msg.type === MessageType.VIDEO ? 120 : null,
                  });
            }

            // --- B. Simulate Reply (Threading) ---
            // 20% tin nhắn là reply của tin nhắn trước đó (trong khoảng 10 tin gần nhất)
            if (i > 5 && faker.datatype.boolean(0.2)) {
                  const parentMsg = createdMessages[faker.number.int({ min: i - 5, max: i - 1 })];
                  updates.push(
                        prisma.message.update({
                              where: { id: msg.id },
                              data: { replyToId: parentMsg.id },
                        })
                  );
            }
      }

      // --- C. Insert Media ---
      if (mediaData.length > 0) {
            await prisma.mediaAttachment.createMany({ data: mediaData });
      }

      // --- D. Execute Reply Updates (Parallel) ---
      await Promise.all(updates);

      // --- E. Unread Logic (receipts removed in hybrid approach) ---
      for (const participant of participants) {
            const isUpToDate = faker.datatype.boolean(0.8);
            let lastReadIndex = createdMessages.length - 1;
            if (!isUpToDate) lastReadIndex = faker.number.int({ min: 50, max: createdMessages.length - 10 });

            let unreadCount = 0;
            let lastReadMessageId: bigint | null = null;
            let lastReadAt: Date | null = null;

            for (let i = 0; i < createdMessages.length; i++) {
                  const msg = createdMessages[i];

                  if (msg.senderId !== participant.id && i > lastReadIndex) {
                        unreadCount++;
                  }

                  if (i === lastReadIndex) {
                        lastReadMessageId = msg.id;
                        lastReadAt = new Date(msg.createdAt.getTime() + 5000);
                  }
            }

            // Update Conversation Member
            await prisma.conversationMember.update({
                  where: {
                        conversationId_userId: { conversationId, userId: participant.id },
                  },
                  data: {
                        lastReadMessageId,
                        lastReadAt,
                        unreadCount,
                        isArchived: faker.datatype.boolean(0.05), // 5% archived
                        isMuted: faker.datatype.boolean(0.1), // 10% muted
                  },
            });
      }

      // Update Last Message
      const lastMsg = createdMessages[createdMessages.length - 1];
      await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: lastMsg.createdAt },
      });
}

/**
 * 6. Tạo Conversations
 */
async function createTargetConversations(targetUser: User, friends: User[], allUsers: User[]) {
      console.log('💬 Creating Conversations & Messages...');

      const DIRECT_COUNT = 70;
      const GROUP_COUNT = 30;

      // --- 6.1 DIRECT CONVERSATIONS ---
      // Lấy 65 friends + 5 strangers (Message Requests)
      const directParticipants = [
            ...friends.slice(0, 65),
            ...allUsers.filter(u => u.id !== targetUser.id && !friends.includes(u)).slice(0, 5)
      ];

      for (let index = 0; index < directParticipants.length; index++) {
            const partner = directParticipants[index];
            console.log(`Processing Direct Conv ${index + 1}/${DIRECT_COUNT}...`);

            const conv = await prisma.conversation.create({
                  data: {
                        type: ConversationType.DIRECT,
                        participants: [targetUser.id, partner.id], // [NEW] caching participants array
                        settings: {} as Prisma.InputJsonValue,
                        members: {
                              create: [
                                    { userId: targetUser.id, role: MemberRole.MEMBER, status: MemberStatus.ACTIVE },
                                    { userId: partner.id, role: MemberRole.MEMBER, status: MemberStatus.ACTIVE },
                              ],
                        },
                  },
            });

            // Block logic: 5%
            if (faker.datatype.boolean(0.05)) {
                  const isTargetBlocker = faker.datatype.boolean();
                  if (isTargetBlocker) await simulateBlock(targetUser.id, partner.id);
                  else await simulateBlock(partner.id, targetUser.id);
            }

            await seedDetailedMessagesForConversation(conv.id, [targetUser, partner], targetUser.id);
      }

      // --- 6.2 GROUP CONVERSATIONS ---
      for (let i = 0; i < GROUP_COUNT; i++) {
            console.log(`Processing Group Conv ${i + 1}/${GROUP_COUNT}...`);

            const groupMembers = faker.helpers.arrayElements(friends, faker.number.int({ min: 3, max: 8 }));
            const allMembers = [targetUser, ...groupMembers];
            const isTargetAdmin = faker.datatype.boolean(0.7);
            const requireApproval = faker.datatype.boolean(0.3); // 30% nhóm cần duyệt

            const conv = await prisma.conversation.create({
                  data: {
                        type: ConversationType.GROUP,
                        name: `Group: ${faker.commerce.department()} Team`,
                        avatarUrl: faker.image.urlLoremFlickr({ category: 'business' }),
                        participants: allMembers.map(u => u.id),
                        requireApproval,
                        settings: { allowMemberInvite: true, muteUntil: null } as Prisma.InputJsonValue,
                        members: {
                              create: allMembers.map((u) => ({
                                    userId: u.id,
                                    role: (u.id === targetUser.id && isTargetAdmin) ? MemberRole.ADMIN : MemberRole.MEMBER,
                                    status: MemberStatus.ACTIVE,
                                    joinedAt: faker.date.past(),
                              })),
                        },
                  },
            });

            // 6.3 Giả lập Join Requests (nếu nhóm cần duyệt)
            if (requireApproval && isTargetAdmin) {
                  // Có người lạ xin vào nhóm
                  const stranger = allUsers.find(u => !allMembers.includes(u));
                  if (stranger) {
                        await prisma.groupJoinRequest.create({
                              data: {
                                    conversationId: conv.id,
                                    userId: stranger.id,
                                    status: JoinRequestStatus.PENDING,
                                    message: 'Cho mình vào nhóm với!',
                                    inviterId: null, // Tự xin vào
                              }
                        });
                  }
            }

            // Giả lập Target user được mời vào một nhóm khác (Inviter ID)
            if (i === GROUP_COUNT - 1) {
                  const friendAdmin = groupMembers[0];
                  await prisma.groupJoinRequest.create({
                        data: {
                              conversationId: conv.id,
                              userId: targetUser.id, // Target được mời
                              inviterId: friendAdmin.id,
                              status: JoinRequestStatus.PENDING,
                        }
                  });
            }

            await seedDetailedMessagesForConversation(conv.id, allMembers, targetUser.id);
      }
}

async function main() {
      try {
            await prisma.$connect();
            console.log('🚀 Seeding START for Target User: ' + TARGET_PHONE);

            await cleanDatabase();

            // 1. Create Users & Privacy
            const { targetUser, allUsers } = await createUsers();

            // 2. Create Contacts (Shadow Graph)
            await createUserContacts(targetUser, allUsers);

            // 3. Create Friends (Target <-> Others)
            const otherUsers = allUsers.filter((u) => u.id !== targetUser.id);
            const friends = await createTargetFriendships(targetUser, otherUsers);

            // 4. Create Conversations & Full Messages History
            await createTargetConversations(targetUser, friends, allUsers);

            console.log('🎉 Seeding COMPLETED!');
            console.log('👉 Login with phone: ' + TARGET_PHONE);
            console.log('👉 Features Simulated: Privacy, Shadow Contacts, Media, Reply, Block, Join Requests.');
      } catch (error) {
            console.error('❌ Seed failed:', error);
            process.exit(1);
      } finally {
            await prisma.$disconnect();
      }
}

main();
