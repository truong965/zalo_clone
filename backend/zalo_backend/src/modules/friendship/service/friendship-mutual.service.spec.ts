// import { describe, it, expect, beforeEach, vi } from 'vitest';
// import { Test, TestingModule } from '@nestjs/testing';
// import { FriendshipService } from './friendship.service';
// import { PrismaService } from '@database/prisma.service';
// import { RedisService } from '@shared/redis/redis.service';
// import { DistributedLockService } from '@common/distributed-lock/distributed-lock.service';
// import { BLOCK_CHECKER } from '@modules/block/services/block-checker.interface';
// import { FriendshipStatus } from '@prisma/client';
// import socialConfig from '@config/social.config';
// import { EventPublisher } from '@shared/events';
// import { DisplayNameResolver } from '@shared/services';

// const mockFriendship = {
//   id: 'friendship-123',
//   user1Id: 'user-1',
//   user2Id: 'user-2',
//   requesterId: 'user-1',
//   status: FriendshipStatus.PENDING,
//   deletedAt: null,
//   acceptedAt: null,
//   declinedAt: null,
//   expiresAt: new Date(),
//   lastActionAt: new Date(),
//   lastActionBy: 'user-1',
//   createdAt: new Date(),
//   updatedAt: new Date(),
// };

// describe('FriendshipService - Mutual Requests', () => {
//   let service: FriendshipService;
//   let prisma: any;
//   let blockChecker: any;
//   let eventPublisher: any;
//   let lockService: any;

//   beforeEach(async () => {
//     prisma = {
//       friendship: {
//         findFirst: vi.fn(),
//         findUnique: vi.fn(),
//         findMany: vi.fn().mockResolvedValue([]),
//         create: vi.fn(),
//         update: vi.fn().mockImplementation((args) =>
//           Promise.resolve({ ...mockFriendship, ...args.data }),
//         ),
//         count: vi.fn().mockResolvedValue(0),
//       },
//     };

//     blockChecker = { isBlocked: vi.fn().mockResolvedValue(false) };
//     eventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
//     lockService = {
//       withLock: vi.fn().mockImplementation((_key, fn) => fn()),
//     };

//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         FriendshipService,
//         { provide: PrismaService, useValue: prisma },
//         {
//           provide: RedisService,
//           useValue: {
//             get: vi.fn().mockResolvedValue(null),
//             setex: vi.fn().mockResolvedValue('OK'),
//             del: vi.fn().mockResolvedValue(undefined),
//             deletePattern: vi.fn().mockResolvedValue(0),
//             getClient: vi.fn(() => ({
//               pipeline: vi.fn(() => ({
//                 incr: vi.fn().mockReturnThis(),
//                 expire: vi.fn().mockReturnThis(),
//                 exec: vi.fn().mockResolvedValue([]),
//               })),
//             })),
//           },
//         },
//         { provide: EventPublisher, useValue: eventPublisher },
//         { provide: DistributedLockService, useValue: lockService },
//         { provide: BLOCK_CHECKER, useValue: blockChecker },
//         { provide: DisplayNameResolver, useValue: { batchResolve: vi.fn() } },
//         {
//           provide: socialConfig.KEY,
//           useValue: {
//             ttl: { friendship: 300, friendList: 600 },
//             limits: { friendRequest: { daily: 50, weekly: 100, disabled: false } },
//             cooldowns: { declineHours: 24, requestExpiryDays: 7 },
//           },
//         },
//       ],
//     }).compile();

//     service = module.get<FriendshipService>(FriendshipService);
//     vi.clearAllMocks();
//   });

//   it('should automatically accept request if target user has a pending request to requester', async () => {
//     const requesterId = 'user-2';
//     const targetUserId = 'user-1';
    
//     // Existing friendship is PENDING from user-1 to user-2
//     const existing = {
//         ...mockFriendship,
//         user1Id: 'user-1',
//         user2Id: 'user-2',
//         requesterId: 'user-1', // targetUserId sent it
//         status: FriendshipStatus.PENDING,
//     };

//     // First call (validateCooldowns) returns null (no decline)
//     // Second call (findFriendshipIncludingSoftDeleted) returns existing
//     prisma.friendship.findFirst
//         .mockResolvedValueOnce(null)
//         .mockResolvedValueOnce(existing);

//     const result = await service.sendFriendRequest(requesterId, targetUserId);

//     expect(result.status).toBe(FriendshipStatus.ACCEPTED);
//     expect(prisma.friendship.update).toHaveBeenCalledWith(expect.objectContaining({
//         where: { id: existing.id },
//         data: expect.objectContaining({
//             status: FriendshipStatus.ACCEPTED,
//             lastActionBy: requesterId,
//         }),
//     }));
    
//     // Verify accepted event was published
//     expect(eventPublisher.publish).toHaveBeenCalledWith(
//         expect.objectContaining({
//             friendshipId: existing.id,
//             acceptedBy: requesterId,
//         }),
//         expect.anything()
//     );
//   });

//   it('should throw DuplicateRequestException if requester already has a pending request to target', async () => {
//     const requesterId = 'user-1';
//     const targetUserId = 'user-2';
    
//     const existing = {
//         ...mockFriendship,
//         user1Id: 'user-1',
//         user2Id: 'user-2',
//         requesterId: 'user-1', // already sent by requester
//         status: FriendshipStatus.PENDING,
//     };

//     // First call (validateCooldowns) returns null (no decline)
//     // Second call (findFriendshipIncludingSoftDeleted) returns existing
//     prisma.friendship.findFirst
//         .mockResolvedValueOnce(null)
//         .mockResolvedValueOnce(existing);

//     await expect(service.sendFriendRequest(requesterId, targetUserId))
//         .rejects.toThrow('Friend request already pending');
//   });
// });
