/* eslint-disable */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  MessageType,
  UserStatus,
} from '@prisma/client';

describe('Conversation + Message E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let user1: any;
  let user2: any;
  let token1: string;
  let token2: string;

  let conversation: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(['error', 'warn']);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    await prisma.message.deleteMany();
    await prisma.conversationMember.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany({
      where: {
        phoneNumber: { in: ['0999000101', '0999000102'] },
      },
    });

    user1 = await prisma.user.create({
      data: {
        phoneNumber: '0999000101',
        displayName: 'Conv Test User 1',
        passwordHash: 'hashed',
        status: UserStatus.ACTIVE,
        passwordVersion: 1,
      },
    });

    user2 = await prisma.user.create({
      data: {
        phoneNumber: '0999000102',
        displayName: 'Conv Test User 2',
        passwordHash: 'hashed',
        status: UserStatus.ACTIVE,
        passwordVersion: 1,
      },
    });

    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret';
    token1 = jwtService.sign(
      { sub: user1.id, type: 'access', pwdVer: 1 },
      { secret },
    );
    token2 = jwtService.sign(
      { sub: user2.id, type: 'access', pwdVer: 1 },
      { secret },
    );

    conversation = await prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        createdById: user1.id,
        lastMessageAt: new Date(),
        members: {
          create: [
            {
              userId: user1.id,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
            },
            {
              userId: user2.id,
              role: MemberRole.MEMBER,
              status: MemberStatus.ACTIVE,
            },
          ],
        },
      },
    });

    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          senderId: user1.id,
          type: MessageType.TEXT,
          content: 'm1',
          clientMessageId: 'client-m1',
        },
        {
          conversationId: conversation.id,
          senderId: user2.id,
          type: MessageType.TEXT,
          content: 'm2',
          clientMessageId: 'client-m2',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /conversations', () => {
    it('should return data + meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations?limit=20')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('hasNextPage');
      expect(res.body.meta).toHaveProperty('nextCursor');
    });
  });

  describe('GET /messages', () => {
    it('should return data + meta for conversation member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/messages?conversationId=${conversation.id}&limit=2`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.limit).toBe(2);
    });

    it('should reject invalid cursor', async () => {
      await request(app.getHttpServer())
        .get(
          `/messages?conversationId=${conversation.id}&limit=2&cursor=not-a-number`,
        )
        .set('Authorization', `Bearer ${token1}`)
        .expect(400);
    });

    it('should reject non-member', async () => {
      const user3 = await prisma.user.create({
        data: {
          phoneNumber: '0999000103',
          displayName: 'Conv Test User 3',
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          passwordVersion: 1,
        },
      });

      const secret = process.env.JWT_ACCESS_SECRET || 'access-secret';
      const token3 = jwtService.sign(
        { sub: user3.id, type: 'access', pwdVer: 1 },
        { secret },
      );

      await request(app.getHttpServer())
        .get(`/messages?conversationId=${conversation.id}&limit=2`)
        .set('Authorization', `Bearer ${token3}`)
        .expect(403);
    });
  });
});
