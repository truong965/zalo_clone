/* eslint-disable */
// test/messaging/send-message.e2e-spec.ts
// Comprehensive E2E test for Send Message functionality
// Focus: Error cases and validation
// Environment: Docker (production)
// Test runner: Vitest
// npm run test:e2e:ui -- test/e2e/send-message.e2e-spec.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MessageType, UserStatus, ConversationType, MemberRole, MediaProcessingStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * TEST FILES REQUIRED:
 * - test/files/test-image.jpg (valid JPEG)
 * - test/files/test-image.png (valid PNG)
 * - test/files/test-video.mp4 (valid MP4, <10MB)
 * - test/files/test-audio.mp3 (valid MP3)
 * - test/files/test-document.pdf (valid PDF)
 */

describe('Send Message E2E - Focus on Error Cases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Test users
  let user1: any;
  let user2: any;
  let user3: any;
  let token1: string;
  let token2: string;
  let token3: string;

  // Test conversation
  let conversation12: any; // Between user1 and user2
  let conversation23: any; // Between user2 and user3

  // Test media files
  let uploadedImage: any;
  let uploadedImage2: any;
  let uploadedVideo: any;
  let uploadedAudio: any;
  let uploadedDocument: any;

  // Helper: Generate unique client message ID
  const generateClientMsgId = () => uuidv4();

  // Helper: Upload a media file
  const uploadMediaFile = async (
    filePath: string,
    mimeType: string,
    token: string
  ): Promise<any> => {
    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    // 1. Initiate upload
    const initRes = await request(app.getHttpServer())
      .post('/media/upload/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fileName,
        mimeType,
        fileSize: fileStats.size,
      })
      .expect(200);

    const { uploadId, presignedUrl } = initRes.body;

    // 2. Upload to S3
    const axios = (await import('axios')).default;
    await axios.put(presignedUrl, fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileStats.size,
      },
      maxBodyLength: Infinity,
    });

    // 3. Confirm upload
    await request(app.getHttpServer())
      .post('/media/upload/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId })
      .expect(200);

    // 4. Wait for processing (for images/documents - fast)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. Get media info from DB
    const media = await prisma.mediaAttachment.findUnique({
      where: { uploadId },
    });

    return media;
  };

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

    // Clean up
    await prisma.message.deleteMany();
    await prisma.mediaAttachment.deleteMany();
    await prisma.conversationMember.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany({
      where: {
        phoneNumber: { in: ['0999000001', '0999000002', '0999000003'] },
      },
    });

    // Create test users
    user1 = await prisma.user.create({
      data: {
        phoneNumber: '0999000001',
        displayName: 'Test User 1',
        passwordHash: 'hashed',
        status: UserStatus.ACTIVE,
        passwordVersion: 1,
      },
    });

    user2 = await prisma.user.create({
      data: {
        phoneNumber: '0999000002',
        displayName: 'Test User 2',
        passwordHash: 'hashed',
        status: UserStatus.ACTIVE,
        passwordVersion: 1,
      },
    });

    user3 = await prisma.user.create({
      data: {
        phoneNumber: '0999000003',
        displayName: 'Test User 3',
        passwordHash: 'hashed',
        status: UserStatus.ACTIVE,
        passwordVersion: 1,
      },
    });

    // Generate tokens
    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret';
    token1 = jwtService.sign({ sub: user1.id, type: 'access', pwdVer: 1 }, { secret });
    token2 = jwtService.sign({ sub: user2.id, type: 'access', pwdVer: 1 }, { secret });
    token3 = jwtService.sign({ sub: user3.id, type: 'access', pwdVer: 1 }, { secret });

    // Create conversations
    conversation12 = await prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        createdById: user1.id,
        members: {
          createMany: {
            data: [
              { userId: user1.id, role: MemberRole.MEMBER },
              { userId: user2.id, role: MemberRole.MEMBER },
            ],
          },
        },
      },
    });

    conversation23 = await prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        createdById: user2.id,
        members: {
          createMany: {
            data: [
              { userId: user2.id, role: MemberRole.MEMBER },
              { userId: user3.id, role: MemberRole.MEMBER },
            ],
          },
        },
      },
    });

    console.log('🚀 Setup completed - uploading test files...');

    // Upload test files (user1 uploads all for simplicity)
    try {
      uploadedImage = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-image.jpg'),
        'image/jpeg',
        token1
      );
      console.log('✅ Image 1 uploaded');

      uploadedImage2 = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-image.png'),
        'image/png',
        token1
      );
      console.log('✅ Image 2 uploaded');

      uploadedVideo = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-video.mp4'),
        'video/mp4',
        token1
      );
      console.log('✅ Video uploaded');

      uploadedAudio = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-audio.mp3'),
        'audio/mpeg',
        token1
      );
      console.log('✅ Audio uploaded');

      uploadedDocument = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-document.pdf'),
        'application/pdf',
        token1
      );
      console.log('✅ Document uploaded');
    } catch (error) {
      console.error('❌ File upload failed:', error);
      throw error;
    }

    console.log('🎉 All test files ready');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    //Unlink media khỏi message trước để tránh bị Cascade Delete
    // Điều này giúp giữ lại file media trong DB cho các test case sau dùng lại
    await prisma.mediaAttachment.updateMany({
      where: { messageId: { not: null } },
      data: { messageId: null },
    });
    // Clean messages before each test (keep media for reuse)
    await prisma.message.deleteMany();
  });

  // ============================================================================
  // HAPPY PATH TESTS (Baseline)
  // ============================================================================

  describe('✅ Happy Path - Valid Messages', () => {
    it('should send TEXT message successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Hello, this is a text message',
        })
        .expect(201);

      expect(res.body.type).toBe(MessageType.TEXT);
      expect(res.body.content).toBe('Hello, this is a text message');
      expect(res.body.mediaAttachments).toHaveLength(0);
    });

    it('should send IMAGE message with caption', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          content: 'Check out this photo!',
          mediaIds: [uploadedImage.id],
        })
        .expect(201);

      expect(res.body.type).toBe(MessageType.IMAGE);
      expect(res.body.content).toBe('Check out this photo!');
      expect(res.body.mediaAttachments).toHaveLength(1);
      expect(res.body.mediaAttachments[0].mediaType).toBe('IMAGE');
    });

    it('should send IMAGE album (multiple images)', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: [uploadedImage.id, uploadedImage2.id],
        })
        // .expect(201);

        if (res.status !== 201) {
    console.error('❌ Server Error Response:', JSON.stringify(res.body, null, 2));
  }expect(res.status).toBe(201);
      expect(res.body.type).toBe(MessageType.IMAGE);
      expect(res.body.mediaAttachments).toHaveLength(2);
    });

    it('should send VIDEO message', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.VIDEO,
          content: 'Cool video',
          mediaIds: [uploadedVideo.id],
        })
        .expect(201);

      expect(res.body.type).toBe(MessageType.VIDEO);
      expect(res.body.mediaAttachments).toHaveLength(1);
      expect(res.body.mediaAttachments[0].mediaType).toBe('VIDEO');
    });

    it('should send FILE (document) message', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.FILE,
          mediaIds: [uploadedDocument.id],
        })
        .expect(201);

      expect(res.body.type).toBe(MessageType.FILE);
      expect(res.body.mediaAttachments).toHaveLength(1);
      expect(res.body.mediaAttachments[0].mediaType).toBe('DOCUMENT');
    });

    it('should send AUDIO message', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.AUDIO,
          mediaIds: [uploadedAudio.id],
        })
        .expect(201);

      expect(res.body.type).toBe(MessageType.AUDIO);
      expect(res.body.mediaAttachments).toHaveLength(1);
      expect(res.body.mediaAttachments[0].mediaType).toBe('AUDIO');
    });

    it('should send VOICE message (no caption allowed)', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.VOICE,
          mediaIds: [uploadedAudio.id],
        })
        // .expect(201);
        if (res.status !== 201) {
    console.error('❌ Server Error Response:', JSON.stringify(res.body, null, 2));
  }expect(res.status).toBe(201);
      expect(res.body.type).toBe(MessageType.VOICE);
      expect(res.body.content).toBeNull();
      expect(res.body.mediaAttachments).toHaveLength(1);
    });
  });

  // ============================================================================
  // ERROR CASES - VALIDATION ERRORS (Focus Area)
  // ============================================================================

  describe('❌ Validation Errors - MessageType Rules', () => {
    describe('TEXT Message Validation', () => {
      it('should reject TEXT message without content', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.TEXT,
            content: '',
          })
          .expect(400);

        expect(res.body.message).toContain('TEXT message must have non-empty content');
      });

      it('should reject TEXT message with only whitespace', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.TEXT,
            content: '   ',
          })
          .expect(400);

        expect(res.body.message).toContain('TEXT message must have non-empty content');
      });

      it('should reject TEXT message with media attachments', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.TEXT,
            content: 'Hello with image',
            mediaIds: [uploadedImage.id],
          })
          .expect(400);

        expect(res.body.message).toContain('TEXT message cannot have media');
      });
    });

    describe('IMAGE Message Validation', () => {
      it('should reject IMAGE message without media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.IMAGE,
            content: 'Caption without image',
          })
          .expect(400);

        expect(res.body.message).toContain('IMAGE message must have at least 1 media attachment');
      });

      it('should reject IMAGE message with more than 10 photos', async () => {
        // Create array of 11 image IDs (duplicate allowed for test)
        const elevenImages = Array(11).fill(uploadedImage.id);

        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.IMAGE,
            mediaIds: elevenImages,
          })
          .expect(400);
      });

      it('should reject IMAGE message with non-IMAGE media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.IMAGE,
            mediaIds: [uploadedVideo.id], // VIDEO file in IMAGE message
          })
          .expect(400);

        expect(res.body.message).toContain('IMAGE message cannot contain VIDEO files');
      });

      it('should reject IMAGE album with mixed media types', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.IMAGE,
            mediaIds: [uploadedImage.id, uploadedDocument.id], // Image + Document
          })
          .expect(400);

        expect(res.body.message).toContain('IMAGE message cannot contain DOCUMENT files. Expected: IMAGE');
      });
    });

    describe('VIDEO Message Validation', () => {
      it('should reject VIDEO message without media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VIDEO,
          })
          .expect(400);

        expect(res.body.message).toContain('VIDEO message must have exactly 1 video file');
      });

      it('should reject VIDEO message with multiple videos', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VIDEO,
            mediaIds: [uploadedVideo.id, uploadedVideo.id],
          })
          .expect(400);

        expect(res.body.message).toContain('VIDEO message must have exactly 1 video file');
      });

      it('should reject VIDEO message with non-VIDEO media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VIDEO,
            mediaIds: [uploadedImage.id], // Image in VIDEO message
          })
          .expect(400);

        expect(res.body.message).toContain('VIDEO message cannot contain IMAGE files');
      });
    });

    describe('FILE Message Validation', () => {
      it('should reject FILE message without media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.FILE,
          })
          .expect(400);

        expect(res.body.message).toContain('FILE message must have at least 1 document');
      });

      it('should reject FILE message with more than 5 documents', async () => {
        const sixDocs = Array(6).fill(uploadedDocument.id);

        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.FILE,
            mediaIds: sixDocs,
          })
          .expect(400);

        expect(res.body.message).toContain('max 5');
      });

      it('should reject FILE message with non-DOCUMENT media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.FILE,
            mediaIds: [uploadedAudio.id], // Audio in FILE message
          })
          .expect(400);

        expect(res.body.message).toContain('FILE message cannot contain AUDIO files');
      });
    });

    describe('VOICE Message Validation', () => {
      it('should reject VOICE message without media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VOICE,
          })
          .expect(400);

        expect(res.body.message).toContain('VOICE message must have exactly 1 audio file');
      });

      it('should reject VOICE message with multiple audio files', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VOICE,
            mediaIds: [uploadedAudio.id, uploadedAudio.id],
          })
          .expect(400);

        expect(res.body.message).toContain('VOICE message must have exactly 1 audio file');
      });

      it('should reject VOICE message with text content', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VOICE,
            content: 'This should not be allowed',
            mediaIds: [uploadedAudio.id],
          })
          .expect(400);

        expect(res.body.message).toContain('VOICE message cannot have text content');
      });

      it('should reject VOICE message with non-AUDIO media', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.VOICE,
            mediaIds: [uploadedVideo.id], // Video in VOICE message
          })
          .expect(400);

        expect(res.body.message).toContain('VOICE message cannot contain VIDEO files');
      });
    });

    describe('SYSTEM Message Validation', () => {
      it('should reject user-sent SYSTEM message', async () => {
        const res = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.SYSTEM,
            content: 'System message',
          })
          .expect(400);

        expect(res.body.message).toContain('SYSTEM messages cannot be sent by users');
      });
    });
  });

  // ============================================================================
  // ERROR CASES - SECURITY & AUTHORIZATION
  // ============================================================================

  describe('🔒 Security & Authorization Errors', () => {
    it('should reject message to conversation user is not member of', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token3}`) // User3 not in conversation12
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Unauthorized message',
        })
        .expect(403);

      expect(res.body.message).toContain('Not a member of conversation');
    });

    it('should reject message with media owned by another user (IDOR)', async () => {
      // User2 uploads their own image
      const user2Image = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-image.jpg'),
        'image/jpeg',
        token2
      );

      // User1 tries to use User2's image
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: [user2Image.id], // Not owned by user1
        })
        .expect(403);

      expect(res.body.message).toContain('You do not own media');
    });

    it('should reject message with already attached media', async () => {
      // Send first message with image
      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: [uploadedImage.id],
        })
        .expect(201);

      // Try to reuse same image in another message
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: [uploadedImage.id], // Already attached to previous message
        })
        .expect(400);

      expect(res.body.message).toContain('already attached to another message');
    });

    it('should reject message with non-existent media ID', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: ['non-existent-media-id'],
        })
        .expect(400);

      expect(res.body.message).toContain('mediaIds must contain valid UUIDs');
    });

    it('should reject message with deleted media', async () => {
      // Upload and then soft-delete a media
      const tempImage = await uploadMediaFile(
        path.join(process.cwd(), 'test/files/test-image.jpg'),
        'image/jpeg',
        token1
      );

      await prisma.mediaAttachment.update({
        where: { id: tempImage.id },
        data: { deletedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: [tempImage.id],
        })
        .expect(400);

      expect(res.body.message).toContain('has been deleted');
    });

    it('should reject message with FAILED media', async () => {
      // Mark media as FAILED
      await prisma.mediaAttachment.update({
        where: { id: uploadedImage2.id },
        data: { 
          processingStatus: MediaProcessingStatus.FAILED,
          processingError: 'Test failure',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: [uploadedImage2.id],
        })
        .expect(400);

      expect(res.body.message).toContain('not ready');

      // Restore for other tests
      await prisma.mediaAttachment.update({
        where: { id: uploadedImage2.id },
        data: { 
          processingStatus: MediaProcessingStatus.READY,
          processingError: null,
        },
      });
    });
  });

  // ============================================================================
  // ERROR CASES - REPLY-TO VALIDATION
  // ============================================================================

  describe('💬 Reply-To Validation Errors', () => {
    it('should allow valid reply to message in same conversation', async () => {
      // Send original message
      const original = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Original message',
        })
        .expect(201);

      // Reply to it
      const reply = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Reply message',
          replyTo: { messageId: original.body.id },
        })
        .expect(201);

      expect(reply.body.replyToId).toBe(original.body.id);
    });

    it('should reject reply to non-existent message', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Reply to ghost',
          replyTo: { messageId: '999999' },
        })
        .expect(400);

      expect(res.body.message).toContain('Reply-to message not found');
    });

    it('should reject reply to message from different conversation', async () => {
      // Send message in conversation23
      const msgInConv23 = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          conversationId: conversation23.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Message in conversation 23',
        })
        .expect(201);

      // Try to reply to it from conversation12
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Cross-conversation reply',
          replyTo: { messageId: msgInConv23.body.id },
        })
        .expect(400);

      expect(res.body.message).toContain('Cannot reply to message from different conversation');
    });

    it('should reject reply to deleted message', async () => {
      // Send and delete a message
      const deleted = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'To be deleted',
        })
        .expect(201);

      await prisma.message.update({
        where: { id: deleted.body.id },
        data: { deletedAt: new Date() },
      });

      // Try to reply to deleted message
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Reply to deleted',
          replyTo: { messageId: deleted.body.id },
        })
        .expect(400);

      expect(res.body.message).toContain('Cannot reply to deleted message');
    });
  });

  // ============================================================================
  // ERROR CASES - INPUT VALIDATION
  // ============================================================================

  describe('📝 Input Validation Errors', () => {
    it('should reject missing conversationId', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Missing conversation',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should reject missing clientMessageId', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          type: MessageType.TEXT,
          content: 'Missing client ID',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should reject invalid conversationId format', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: 'not-a-uuid',
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Invalid conversation',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should reject content exceeding 10KB limit', async () => {
      const longContent = 'A'.repeat(10001); // 10001 chars

      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: longContent,
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should reject metadata exceeding 10KB limit', async () => {
    const largeMetadata = { data: 'X'.repeat(11000) };

      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Test',
          metadata: largeMetadata,
        })
        .expect(400);

      expect(res.body.message).toContain('metadata exceeds 10KB limit');
    });

    it('should reject mediaIds exceeding array limit (10)', async () => {
      const elevenIds = Array(11).fill('some-id');

      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          mediaIds: elevenIds,
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ============================================================================
  // EDGE CASES - RACE CONDITIONS & CONCURRENCY
  // ============================================================================

  describe('⚡ Edge Cases - Race Conditions', () => {
    it('should handle duplicate clientMessageId (idempotency)', async () => {
      const clientMsgId = generateClientMsgId();

      // Send first request
      const res1 = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: clientMsgId,
          type: MessageType.TEXT,
          content: 'First attempt',
        })
        .expect(201);

      // Send duplicate request
      const res2 = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: clientMsgId,
          type: MessageType.TEXT,
          content: 'Duplicate attempt',
        })
        .expect(201);

      // Both should return same message
      expect(res1.body.id).toBe(res2.body.id);

      // Verify only 1 message created
      const count = await prisma.message.count({
        where: { clientMessageId: clientMsgId },
      });
      expect(count).toBe(1);
    });

    it('should handle concurrent duplicate requests', async () => {
      const clientMsgId = generateClientMsgId();

      // Send 3 concurrent requests
      const promises = Array(3).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: clientMsgId,
            type: MessageType.TEXT,
            content: 'Concurrent test',
          })
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(res => expect(res.status).toBe(201));

      // All should return same message ID
      const ids = results.map(r => r.body.id);
      expect(new Set(ids).size).toBe(1);

      // Only 1 message created
      const count = await prisma.message.count({
        where: { clientMessageId: clientMsgId },
      });
      expect(count).toBe(1);
    });
  });

  // ============================================================================
  // EDGE CASES - SPECIAL SCENARIOS
  // ============================================================================

  describe('🎯 Edge Cases - Special Scenarios', () => {
    it('should accept PROCESSING status media (show loading to user)', async () => {
      // Mark media as PROCESSING
      await prisma.mediaAttachment.update({
        where: { id: uploadedVideo.id },
        data: { processingStatus: MediaProcessingStatus.PROCESSING },
      });

      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.VIDEO,
          mediaIds: [uploadedVideo.id],
        })
        .expect(201);

      expect(res.body.mediaAttachments[0].processingStatus).toBe('PROCESSING');

      // Restore
      await prisma.mediaAttachment.update({
        where: { id: uploadedVideo.id },
        data: { processingStatus: MediaProcessingStatus.READY },
      });
    });

    it('should trim whitespace from content', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: '  Hello with spaces  ',
        })
        .expect(201);

      expect(res.body.content).toBe('Hello with spaces');
    });

    it('should accept null content for media messages', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.IMAGE,
          content: null,
          mediaIds: [uploadedImage.id],
        })
        .expect(201);

      expect(res.body.content).toBeNull();
    });

    it('should accept empty metadata', async () => {
      const res = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Test',
          metadata: {},
        })
        .expect(201);

      expect(res.body.metadata).toEqual({});
    });

    it('should update conversation lastMessageAt', async () => {
      const beforeTime = new Date();

      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          conversationId: conversation12.id,
          clientMessageId: generateClientMsgId(),
          type: MessageType.TEXT,
          content: 'Update timestamp test',
        })
        .expect(201);

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversation12.id },
      });

      expect(conversation!.lastMessageAt).toBeDefined();
      expect(conversation!.lastMessageAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('⚡ Performance Tests', () => {
    it('should send message in under 100ms (p95)', async () => {
      const times: number[] = [];

      // Send 20 messages and measure
      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${token1}`)
          .send({
            conversationId: conversation12.id,
            clientMessageId: generateClientMsgId(),
            type: MessageType.TEXT,
            content: `Performance test ${i}`,
          })
          .expect(201);
        times.push(Date.now() - start);
      }

      // Calculate p95
      times.sort((a, b) => a - b);
      const p95Index = Math.floor(times.length * 0.95);
      const p95 = times[p95Index];

      console.log(`Message send times: min=${times[0]}ms, max=${times[times.length - 1]}ms, p95=${p95}ms`);
      expect(p95).toBeLessThan(100);
    });
  });
});
