// test/mocks/seed-fake-data.ts
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
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fakerVI as faker } from '@faker-js/faker';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
const CONFIG = {
  USERS: 80,
  FRIENDSHIPS: 250,
  DIRECT_CONVERSATIONS: 60,
  GROUPS: 15,
  MESSAGES_PER_CONV: 25,
  PENDING_JOIN_REQUESTS: 20,
  DEFAULT_PASSWORD_HASH:
    '$2b$10$pWCRXcgi/rS0K2zXgrJZOOuMkVI.IdfD6NyhkB6RjSHo99y1pYkhW',
};

async function cleanDatabase() {
  console.log('🗑️  Cleaning database...');

  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.groupJoinRequest.deleteMany(),
    prisma.conversationMember.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.friendship.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log('✅ Database cleaned');
}

async function createUsers() {
  console.log('👤 Creating users...');

  const users: Prisma.UserCreateManyInput[] = [];

  // User chính để bạn test login
  users.push({
    phoneNumber: '0909000111',
    displayName: 'Tech Lead (Admin)',
    avatarUrl: 'https://i.pravatar.cc/300?u=admin',
    passwordHash: CONFIG.DEFAULT_PASSWORD_HASH,
    bio: 'Zalo Clone Core Team',
    status: UserStatus.ACTIVE,
    gender: 'MALE',
  });

  for (let i = 0; i < CONFIG.USERS; i++) {
    const sex = faker.person.sexType();
    users.push({
      phoneNumber: faker.phone
        .number({ style: 'national' })
        .replace(/\D/g, '')
        .slice(0, 15),
      displayName: faker.person.fullName({ sex }),
      avatarUrl: faker.image.avatar(),
      passwordHash: CONFIG.DEFAULT_PASSWORD_HASH,
      bio: faker.lorem.sentence(8),
      status: UserStatus.ACTIVE,
      gender: sex.toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE',
    });
  }

  await prisma.user.createMany({ data: users, skipDuplicates: true });
  const allUsers = await prisma.user.findMany({
    select: { id: true, displayName: true },
  });

  console.log(`✅ Created ${allUsers.length} users`);
  return allUsers;
}

async function createFriendships(users: { id: string }[]) {
  console.log('🤝 Creating friendships...');

  const data: Prisma.FriendshipCreateManyInput[] = [];

  for (let i = 0; i < CONFIG.FRIENDSHIPS; i++) {
    const a = faker.helpers.arrayElement(users);
    const b = faker.helpers.arrayElement(users);
    if (a.id === b.id) continue;

    const [user1Id, user2Id] = [a.id, b.id].sort();

    data.push({
      user1Id,
      user2Id,
      requesterId: user1Id,
      status: FriendshipStatus.ACCEPTED,
      createdAt: faker.date.past({ years: 2 }),
    });
  }

  await prisma.friendship.createMany({ data, skipDuplicates: true });
  console.log(`✅ Created ${data.length} friendships`);
}

async function createDirectConversations(users: { id: string }[]) {
  console.log('💬 Creating direct conversations...');

  const friendships = await prisma.friendship.findMany({
    where: { status: FriendshipStatus.ACCEPTED },
    take: CONFIG.DIRECT_CONVERSATIONS,
  });

  for (const f of friendships) {
    const conversation = await prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        participants: [f.user1Id, f.user2Id],
        members: {
          create: [
            {
              userId: f.user1Id,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
            },
            {
              userId: f.user2Id,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
            },
          ],
        },
      },
    });

    await seedMessages(conversation.id, [f.user1Id, f.user2Id]);
  }

  console.log(`✅ Created ${friendships.length} direct conversations`);
}

async function createGroups(users: { id: string }[]) {
  console.log('👥 Creating groups...');

  for (let i = 0; i < CONFIG.GROUPS; i++) {
    const admin = faker.helpers.arrayElement(users);
    const members = faker.helpers.arrayElements(users, { min: 4, max: 12 });

    if (!members.some((m) => m.id === admin.id)) members.push(admin);

    const group = await prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: `${faker.commerce.department()} ${faker.word.sample()}`,
        avatarUrl: faker.image.avatar(),
        requireApproval: faker.datatype.boolean(0.3),
        members: {
          create: members.map((m) => ({
            userId: m.id,
            role: m.id === admin.id ? MemberRole.ADMIN : MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
          })),
        },
      },
    });

    await seedMessages(
      group.id,
      members.map((m) => m.id),
    );

    // Tạo vài pending join request
    if (i % 3 === 0) {
      const requester = faker.helpers.arrayElement(
        users.filter((u) => !members.some((m) => m.id === u.id)),
      );
      await prisma.groupJoinRequest.create({
        data: {
          conversationId: group.id,
          userId: requester.id,
          status: JoinRequestStatus.PENDING,
          message: faker.lorem.sentence(5),
        },
      });
    }
  }

  console.log(`✅ Created ${CONFIG.GROUPS} groups`);
}

async function seedMessages(conversationId: string, participantIds: string[]) {
  const messages: Prisma.MessageCreateManyInput[] = [];
  let lastTime = faker.date.past({ years: 1 });

  for (let i = 0; i < CONFIG.MESSAGES_PER_CONV; i++) {
    const senderId = faker.helpers.arrayElement(participantIds);
    lastTime = new Date(
      lastTime.getTime() + faker.number.int({ min: 60000, max: 3600000 }),
    );

    messages.push({
      conversationId,
      senderId,
      type: MessageType.TEXT,
      content: faker.lorem.sentence(),
      createdAt: lastTime,
      clientMessageId: faker.string.uuid(),
    });
  }

  await prisma.message.createMany({ data: messages });

  // Update lastMessageAt
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: messages[messages.length - 1].createdAt },
  });
}

async function main() {
  try {
    await prisma.$connect();
    console.log('🚀 Seeding started...');

    await cleanDatabase();

    const users = await createUsers();
    await createFriendships(users);
    await createDirectConversations(users);
    await createGroups(users);

    console.log('🎉 Fake data seeded successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
