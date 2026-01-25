// // src/modules/messaging/__tests__/message.service.spec.ts

// import { Test, TestingModule } from '@nestjs/testing';
// import { MessageService } from '../services/message.service';
// import { PrismaService } from 'src/database/prisma.service';
// import { RedisService } from 'src/modules/redis/redis.service';
// import { ConversationService } from '../services/conversation.service';
// import { ForbiddenException, BadRequestException } from '@nestjs/common';
// import { MessageType } from '@prisma/client';

// describe('MessageService', () => {
//   let service: MessageService;
//   let prisma: jest.Mocked<PrismaService>;
//   let redis: jest.Mocked<RedisService>;
//   let conversationService: jest.Mocked<ConversationService>;

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         MessageService,
//         {
//           provide: PrismaService,
//           useValue: {
//             message: {
//               create: jest.fn(),
//               findUnique: jest.fn(),
//               update: jest.fn(),
//             },
//             conversation: {
//               update: jest.fn(),
//             },
//             $transaction: jest.fn(),
//           },
//         },
//         {
//           provide: RedisService,
//           useValue: {
//             get: jest.fn(),
//             setex: jest.fn(),
//           },
//         },
//         {
//           provide: ConversationService,
//           useValue: {
//             isMember: jest.fn(),
//           },
//         },
//       ],
//     }).compile();

//     service = module.get<MessageService>(MessageService);
//     prisma = module.get(PrismaService);
//     redis = module.get(RedisService);
//     conversationService = module.get(ConversationService);
//   });

//   describe('sendMessage', () => {
//     const mockDto = {
//       conversationId: 'conv-123',
//       clientMessageId: 'client-uuid-456',
//       type: MessageType.TEXT,
//       content: 'Hello World',
//     };

//     const mockMessage = {
//       id: BigInt(1),
//       conversationId: 'conv-123',
//       senderId: 'user-1',
//       type: MessageType.TEXT,
//       content: 'Hello World',
//       createdAt: new Date(),
//       sender: {
//         id: 'user-1',
//         displayName: 'Alice',
//         avatarUrl: null,
//       },
//     };

//     it('should send message successfully', async () => {
//       redis.get.mockResolvedValue(null); // No cached message
//       conversationService.isMember.mockResolvedValue(true);
//       prisma.$transaction.mockResolvedValue(mockMessage);

//       const result = await service.sendMessage(mockDto, 'user-1');

//       expect(result).toEqual(mockMessage);
//       expect(prisma.$transaction).toHaveBeenCalled();
//       expect(redis.setex).toHaveBeenCalled();
//     });

//     it('should return cached message on duplicate send', async () => {
//       redis.get.mockResolvedValue(JSON.stringify(mockMessage));

//       const result = await service.sendMessage(mockDto, 'user-1');

//       expect(result).toEqual(mockMessage);
//       expect(prisma.$transaction).not.toHaveBeenCalled(); // Should not create again
//     });

//     it('should throw ForbiddenException if user not in conversation', async () => {
//       redis.get.mockResolvedValue(null);
//       conversationService.isMember.mockResolvedValue(false);

//       await expect(service.sendMessage(mockDto, 'user-1')).rejects.toThrow(
//         ForbiddenException,
//       );
//     });

//     it('should throw BadRequestException if text message is empty', async () => {
//       redis.get.mockResolvedValue(null);
//       conversationService.isMember.mockResolvedValue(true);

//       const emptyDto = { ...mockDto, content: '   ' };

//       await expect(service.sendMessage(emptyDto, 'user-1')).rejects.toThrow(
//         BadRequestException,
//       );
//     });
//   });
// });
