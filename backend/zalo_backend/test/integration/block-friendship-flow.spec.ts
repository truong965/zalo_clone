// /**
//  * Integration test: Block → Friendship soft delete → Unblock → Restore
//  *
//  * Tests the event-driven flow across Block and Friendship modules:
//  * 1. A blocks B → FriendshipBlockListener soft-deletes friendship
//  * 2. A unblocks B → FriendshipBlockListener restores friendship
//  *
//  * Uses mocked Prisma/Redis - no real DB/Redis required.
//  */
// import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { Test, TestingModule } from '@nestjs/testing';
// import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
// import { ConfigModule } from '@nestjs/config';
// import { BlockService } from '@modules/block/block.service';
// import { FriendshipBlockListener } from '@modules/friendship/listeners/friendship-block.listener';
// import { PrismaService } from '@database/prisma.service';
// import { RedisService } from '@modules/redis/redis.service';
// import { IdempotencyService } from '@common/idempotency/idempotency.service';
// import { BLOCK_REPOSITORY } from '@modules/block/repositories';
// import type { IBlockRepository } from '@modules/block/repositories';
// import { BLOCK_CHECKER } from '@modules/block/services/block-checker.interface';
// import type { IBlockChecker } from '@modules/block/services/block-checker.interface';
// import { FriendshipStatus } from '@prisma/client';
// import socialConfig from '@config/social.config';
// import { UserBlockedEvent, UserUnblockedEvent } from '@shared/events';
// import { CqrsModule, EventBus, EventPublisher } from '@nestjs/cqrs';
// const userA = 'user-a';
// const userB = 'user-b';

// describe('Block-Friendship Flow (Integration)', () => {
//   let blockService: BlockService;
//   let friendshipBlockListener: FriendshipBlockListener;
//   let eventEmitter: EventEmitter2;
//   let app: import('@nestjs/common').INestApplication;

//   let prismaBlockCreate: ReturnType<typeof vi.fn>;
//   let prismaBlockDelete: ReturnType<typeof vi.fn>;
//   let blockRepositoryFindByPair: ReturnType<typeof vi.fn>;
//   let prismaFriendshipFindFirst: ReturnType<typeof vi.fn>;
//   let prismaFriendshipUpdateMany: ReturnType<typeof vi.fn>;
//   let idempotencyIsProcessed: ReturnType<typeof vi.fn>;
//   let idempotencyRecordProcessed: ReturnType<typeof vi.fn>;

//   const mockBlock = {
//     id: 'block-1',
//     blockerId: userA,
//     blockedId: userB,
//     reason: null,
//     createdAt: new Date(),
//   };

//   const mockFriendship = {
//     id: 'friendship-1',
//     user1Id: userA,
//     user2Id: userB,
//     requesterId: userA,
//     status: FriendshipStatus.ACCEPTED,
//     deletedAt: null as Date | null,
//     acceptedAt: new Date(),
//     declinedAt: null,
//     expiresAt: new Date(),
//     lastActionAt: new Date(),
//     lastActionBy: userA,
//     createdAt: new Date(),
//     updatedAt: new Date(),
//   };

//   beforeEach(async () => {
//     prismaBlockCreate = vi.fn().mockResolvedValue(mockBlock);
//     prismaBlockDelete = vi.fn().mockResolvedValue(undefined);
//     blockRepositoryFindByPair = vi.fn().mockResolvedValue(mockBlock);
//     prismaFriendshipFindFirst = vi.fn().mockResolvedValue(mockFriendship);
//     prismaFriendshipUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
//     idempotencyIsProcessed = vi.fn().mockResolvedValue(false);
//     idempotencyRecordProcessed = vi.fn().mockResolvedValue(undefined);

//     const mockPrisma = {
//       block: { create: prismaBlockCreate, delete: prismaBlockDelete },
//       friendship: {
//         findFirst: prismaFriendshipFindFirst,
//         updateMany: prismaFriendshipUpdateMany,
//       },
//     };

//     const mockBlockRepo: IBlockRepository = {
//       exists: vi.fn().mockResolvedValue(false),
//       findByPair: blockRepositoryFindByPair as any,
//     };

//     const mockBlockChecker: IBlockChecker = {
//       isBlocked: vi.fn().mockResolvedValue(false),
//       isBlockedByTarget: vi.fn().mockResolvedValue(false),
//     };

//     const mockRedis = {
//       get: vi.fn().mockResolvedValue(null),
//       setex: vi.fn().mockResolvedValue('OK'),
//       del: vi.fn().mockResolvedValue(undefined),
//       mget: vi.fn().mockResolvedValue([]),
//       mDel: vi.fn().mockResolvedValue(0),
//       deletePattern: vi.fn().mockResolvedValue(0),
//       getClient: vi.fn().mockReturnValue({
//         mget: vi.fn().mockResolvedValue([]),
//         del: vi.fn().mockResolvedValue(0),
//         pipeline: vi.fn(() => ({
//           setex: vi.fn().mockReturnThis(),
//           del: vi.fn().mockReturnThis(),
//           exec: vi.fn().mockResolvedValue([]),
//         })),
//       }),
//     };

//     const module: TestingModule = await Test.createTestingModule({
//       imports: [
//         EventEmitterModule.forRoot(),
//         CqrsModule,
//         ConfigModule.forRoot({
//           load: [
//             () => ({
//               social: {
//                 ttl: {
//                   block: 3600,
//                   privacy: 3600,
//                   permission: 300,
//                   friendship: 300,
//                   friendList: 600,
//                 },
//               },
//             }),
//           ],
//         }),
//       ],
//       providers: [
//         BlockService,
//         FriendshipBlockListener,
//         { provide: PrismaService, useValue: mockPrisma },
//         { provide: RedisService, useValue: mockRedis },
//         {
//           provide: IdempotencyService,
//           useValue: {
//             isProcessed: idempotencyIsProcessed,
//             recordProcessed: idempotencyRecordProcessed,
//             recordError: vi.fn().mockResolvedValue(undefined),
//           },
//         },
//         {
//           provide: EventBus,
//           useValue: {
//             publish: vi.fn(),
//             publishAll: vi.fn(),
//           },
//         },
//         { provide: BLOCK_REPOSITORY, useValue: mockBlockRepo },
//         { provide: BLOCK_CHECKER, useValue: mockBlockChecker },
//         {
//           provide: socialConfig.KEY,
//           useValue: { ttl: { block: 3600 } },
//         },
//       ],
//     }).compile();

//     app = module.createNestApplication();
//     await app.init();

//     blockService = module.get<BlockService>(BlockService);
//     friendshipBlockListener = module.get<FriendshipBlockListener>(
//       FriendshipBlockListener,
//     );
//     eventEmitter = module.get<EventEmitter2>(EventEmitter2);

//     vi.clearAllMocks();
//   });

//   afterEach(async () => {
//     if (app) await app.close();
//   });

//   it('should soft delete friendship when user.blocked is emitted', async () => {
//     prismaFriendshipFindFirst.mockResolvedValueOnce(mockFriendship);
//     prismaFriendshipUpdateMany.mockResolvedValueOnce({ count: 1 });

//     const event = new UserBlockedEvent(userA, userB, 'block-1');
//     await eventEmitter.emitAsync('user.blocked', event);

//     expect(prismaFriendshipFindFirst).toHaveBeenCalledWith(
//       expect.objectContaining({
//         where: {
//           user1Id: userA,
//           user2Id: userB,
//           deletedAt: null,
//         },
//       }),
//     );
//     expect(prismaFriendshipUpdateMany).toHaveBeenCalledWith(
//       expect.objectContaining({
//         where: { user1Id: userA, user2Id: userB, deletedAt: null },
//         data: expect.objectContaining({ deletedAt: expect.any(Date) }),
//       }),
//     );
//   });

//   it('should restore friendship when user.unblocked is emitted', async () => {
//     prismaFriendshipUpdateMany.mockResolvedValueOnce({ count: 1 });

//     const event = new UserUnblockedEvent(userA, userB, 'block-1');
//     await eventEmitter.emitAsync('user.unblocked', event);

//     expect(prismaFriendshipUpdateMany).toHaveBeenCalledWith(
//       expect.objectContaining({
//         where: {
//           user1Id: userA,
//           user2Id: userB,
//           deletedAt: { not: null },
//         },
//         data: { deletedAt: null },
//       }),
//     );
//   });

//   it('should emit user.blocked when blockUser is called', async () => {
//     const emitSpy = vi.spyOn(eventEmitter, 'emit');

//     await blockService.blockUser(userA, { targetUserId: userB });

//     expect(prismaBlockCreate).toHaveBeenCalled();
//     expect(emitSpy).toHaveBeenCalledWith(
//       'user.blocked',
//       expect.any(UserBlockedEvent),
//     );
//   });

//   it('should emit user.unblocked when unblockUser is called', async () => {
//     const emitSpy = vi.spyOn(eventEmitter, 'emit');

//     await blockService.unblockUser(userA, userB);

//     expect(blockRepositoryFindByPair).toHaveBeenCalledWith(userA, userB);
//     expect(prismaBlockDelete).toHaveBeenCalled();
//     expect(emitSpy).toHaveBeenCalledWith(
//       'user.unblocked',
//       expect.any(UserUnblockedEvent),
//     );
//   });
// });
