// //how to test
// // npx dotenv -e .env.test -- npm run test:e2e -- src/modules/messaging/__tests__/e2e/group-messaging.e2e-spec.ts
// /* eslint-disable */
// import { Test, TestingModule } from '@nestjs/testing';
// import { INestApplication } from '@nestjs/common';
// import { io, Socket } from 'socket.io-client';
// import { AppModule } from 'src/app.module';
// import { PrismaService } from 'src/database/prisma.service';
// import { SocketAuthService } from 'src/socket/services/socket-auth.service';
// import { MemberRole, MemberStatus, JoinRequestStatus, Message } from '@prisma/client';
// import { SocketEvents } from 'src/common/constants/socket-events.constant';

// // Helper: Chờ event trả về từ server
// const waitForEvent = (socket: Socket, event: string): Promise<any> => {
//   return new Promise((resolve, reject) => {
//     // Tăng timeout chờ event lên 5s để tránh mạng lag
//     const timeout = setTimeout(() => {
//       reject(new Error(`Timeout waiting for event: ${event}`));
//     }, 5000);

//     socket.once(event, (data) => {
//       clearTimeout(timeout);
//       resolve(data);
//     });

//     // Bắt lỗi từ server trả về nếu có
//     socket.once(SocketEvents.ERROR, (err) => {
//       // Nếu lỗi trả về đúng là event đang chờ xử lý thì reject luôn
//       if (err.event === event) {
//         clearTimeout(timeout);
//         reject(new Error(err.error || 'Unknown Error'));
//       }
//     });
//   });
// };

// describe('Group Messaging E2E', () => {
//   let app: INestApplication;
//   let prisma: PrismaService;

//   let adminSocket: Socket;
//   let memberSocket: Socket;
//   let outsiderSocket: Socket;

//   // Tăng thời gian timeout cho mỗi test case lên 30s (E2E cần nhiều thời gian hơn Unit Test)
//   jest.setTimeout(30000);

//   const tokenAdmin = 'token-user-a';
//   const tokenMember = 'token-user-b';
//   const tokenOutsider = 'token-user-c';

//   let userAdmin: any;
//   let userMember: any;
//   let userOutsider: any;

//   const mockSocketAuthService = {
//     authenticateSocket: jest.fn(),
//   };

//   beforeAll(async () => {
//     const moduleFixture: TestingModule = await Test.createTestingModule({
//       imports: [AppModule],
//     })
//       .overrideProvider(SocketAuthService)
//       .useValue(mockSocketAuthService)
//       .compile();

//     app = moduleFixture.createNestApplication();
//     await app.init();
//     await app.listen(8002); // Port riêng cho test group

//     prisma = app.get(PrismaService);

//     // CLEAN DB
//     await prisma.groupJoinRequest.deleteMany();
//     await prisma.mediaAttachment.deleteMany();
//     await prisma.message.deleteMany();
//     await prisma.conversationMember.deleteMany();
//     await prisma.conversation.deleteMany();
//     await prisma.userToken.deleteMany();
//     await prisma.user.deleteMany();

//     // SEED DATA
//     userAdmin = await prisma.user.create({
//       data: { displayName: 'Admin Alice', phoneNumber: '+84900000001', passwordHash: 'hash' },
//     });
//     userMember = await prisma.user.create({
//       data: { displayName: 'Member Bob', phoneNumber: '+84900000002', passwordHash: 'hash' },
//     });
//     userOutsider = await prisma.user.create({
//       data: { displayName: 'Outsider Charlie', phoneNumber: '+84900000003', passwordHash: 'hash' },
//     });

//     mockSocketAuthService.authenticateSocket.mockImplementation((client) => {
//       const token = client.handshake.auth.token;
//       if (token === tokenAdmin) return userAdmin;
//       if (token === tokenMember) return userMember;
//       if (token === tokenOutsider) return userOutsider;
//       return null;
//     });
//   });

//   afterAll(async () => {
//     if (adminSocket) adminSocket.disconnect();
//     if (memberSocket) memberSocket.disconnect();
//     if (outsiderSocket) outsiderSocket.disconnect();

//     // Chờ socket cleanup
//     await new Promise(resolve => setTimeout(resolve, 500));
//     await app.close();
//   });

//   beforeEach((done) => {
//     const connectSocket = (token: string) =>
//       io('http://localhost:8002/socket.io', {
//         auth: { token },
//         transports: ['websocket'],
//         reconnection: false,
//         forceNew: true,
//       });

//     adminSocket = connectSocket(tokenAdmin);
//     memberSocket = connectSocket(tokenMember);
//     outsiderSocket = connectSocket(tokenOutsider);

//     let connectedCount = 0;
//     const checkConnected = () => {
//       connectedCount++;
//       if (connectedCount === 3) {
//         // QUAN TRỌNG: Chờ server register socket ID vào Redis
//         setTimeout(() => done(), 1000);
//       }
//     };

//     adminSocket.on('connect', checkConnected);
//     memberSocket.on('connect', checkConnected);
//     outsiderSocket.on('connect', checkConnected);
//   });

//   afterEach(() => {
//     adminSocket.disconnect();
//     memberSocket.disconnect();
//     outsiderSocket.disconnect();
//   });

//   // ==========================================
//   // SUITE 1: CORE GROUP LIFECYCLE
//   // ==========================================
//   describe('Suite 1: Group Lifecycle', () => {
//     it('should create a group successfully', async () => {
//       const payload = {
//         name: 'Engineering Team',
//         memberIds: [userMember.id],
//       };

//       // Correct Event: GROUP_CREATE
//       adminSocket.emit(SocketEvents.GROUP_CREATE, payload);

//       const [adminEvent, memberEvent] = await Promise.all([
//         waitForEvent(adminSocket, SocketEvents.GROUP_CREATED),
//         waitForEvent(memberSocket, SocketEvents.GROUP_CREATED),
//       ]);

//       expect(adminEvent.group.name).toBe(payload.name);
//       expect(memberEvent.group.id).toBe(adminEvent.group.id);

//       const groupInDb = await prisma.conversation.findUnique({
//         where: { id: adminEvent.group.id },
//         include: { members: true },
//       });
//       expect(groupInDb).not.toBeNull();
//       expect(groupInDb!.members).toHaveLength(2);
//     });

//     it('should prevent non-admins from updating group info', async () => {
//       // Setup Group
//       const group = await prisma.conversation.create({
//         data: {
//           type: 'GROUP',
//           name: 'Original Name',
//           createdById: userAdmin.id,
//           members: {
//             create: [
//               { userId: userAdmin.id, role: MemberRole.ADMIN },
//               { userId: userMember.id, role: MemberRole.MEMBER },
//             ],
//           },
//         },
//       });

//       // Member attempts update (Correct Event: GROUP_UPDATE)
//       memberSocket.emit(SocketEvents.GROUP_UPDATE, {
//         conversationId: group.id,
//         updates: { name: 'Hacked Name' },
//       });

//       // Expect Error Event
//       const errorData = await waitForEvent(memberSocket, SocketEvents.ERROR);
//       expect(errorData.event).toBe(SocketEvents.GROUP_UPDATE); // Check khớp tên event lỗi

//       const freshGroup = await prisma.conversation.findUnique({ where: { id: group.id } });
//       expect(freshGroup!.name).toBe('Original Name');
//     });

//     it('should dissolve group (Admin only)', async () => {
//        const group = await prisma.conversation.create({
//         data: {
//           type: 'GROUP', createdById: userAdmin.id,
//           members: { create: [{ userId: userAdmin.id, role: MemberRole.ADMIN }, { userId: userMember.id, role: MemberRole.MEMBER }] },
//         },
//       });

//       adminSocket.emit(SocketEvents.GROUP_DISSOLVE, { conversationId: group.id });

//       const [adminEvent, memberEvent] = await Promise.all([
//         waitForEvent(adminSocket, SocketEvents.GROUP_DISSOLVED),
//         waitForEvent(memberSocket, SocketEvents.GROUP_DISSOLVED),
//       ]);

//       expect(adminEvent.conversationId).toBe(group.id);

//       const dbGroup = await prisma.conversation.findUnique({ where: { id: group.id } });
//       expect(dbGroup!.deletedAt).not.toBeNull();
//     });
//   });

//   // ==========================================
//   // SUITE 2: MEMBER MANAGEMENT
//   // ==========================================
//   describe('Suite 2: Member Management', () => {
//     let groupId: string;

//     beforeEach(async () => {
//       const group = await prisma.conversation.create({
//         data: {
//           type: 'GROUP', name: 'Member Mgmt Group', createdById: userAdmin.id,
//           members: {
//             create: [
//               { userId: userAdmin.id, role: MemberRole.ADMIN },
//               { userId: userMember.id, role: MemberRole.MEMBER },
//             ],
//           },
//         },
//       });
//       groupId = group.id;
//     });

//     it('Admin can add new members', async () => {
//       // Admin adds Outsider (Correct Event: GROUP_ADD_MEMBERS - Plural)
//       adminSocket.emit(SocketEvents.GROUP_ADD_MEMBERS, {
//         conversationId: groupId,
//         userIds: [userOutsider.id],
//       });

//       // Admin & Member get notified (Correct Event: GROUP_MEMBERS_ADDED)
//       const [adminNotif, memberNotif] = await Promise.all([
//         waitForEvent(adminSocket, SocketEvents.GROUP_MEMBERS_ADDED),
//         waitForEvent(memberSocket, SocketEvents.GROUP_MEMBERS_ADDED),
//       ]);

//       expect(adminNotif.addedUserIds).toContain(userOutsider.id);

//       const newMember = await prisma.conversationMember.findUnique({
//         where: { conversationId_userId: { conversationId: groupId, userId: userOutsider.id } },
//       });
//       expect(newMember).not.toBeNull();
//       expect(newMember!.status).toBe(MemberStatus.ACTIVE);
//     });

//     it('Admin can remove a member', async () => {
//       // Correct Event: GROUP_REMOVE_MEMBER (Singular)
//       //// 1. Setup Promise.all để lắng nghe TRƯỚC KHI gửi lệnh
//       // Điều này đảm bảo không bao giờ bị miss event dù nó đến nhanh cỡ nào
//      const promises = Promise.all([
//         waitForEvent(memberSocket, SocketEvents.GROUP_YOU_WERE_REMOVED),
//         waitForEvent(adminSocket, SocketEvents.GROUP_MEMBER_REMOVED),
//       ]);
//       // 2. Thực hiện hành động (Gửi lệnh xóa)
//       adminSocket.emit(SocketEvents.GROUP_REMOVE_MEMBER, {
//         conversationId: groupId,
//         userId: userMember.id,
//       });

//       // Member gets: YOU_WERE_REMOVED
//       // // Admin gets: MEMBER_REMOVED
//       // 3. Chờ cả 2 sự kiện cùng về đích
//       const [removedEvent, adminNotif] = await promises;

//       // const removedEvent = await waitForEvent(memberSocket, SocketEvents.GROUP_YOU_WERE_REMOVED);
//       expect(removedEvent.conversationId).toBe(groupId);
//       // const adminNotif = await waitForEvent(adminSocket, SocketEvents.GROUP_MEMBER_REMOVED);
//       expect(adminNotif.removedUserId).toBe(userMember.id);

//       // 5. Check DB
//       const memberRecord = await prisma.conversationMember.findUnique({
//         where: { conversationId_userId: { conversationId: groupId, userId: userMember.id } },
//       });

//       expect(memberRecord).not.toBeNull();
//       expect(memberRecord!.status).toBe(MemberStatus.KICKED);
//     });

//     it('Member can leave the group', async () => {
//       // Correct Event: GROUP_LEAVE
//       memberSocket.emit(SocketEvents.GROUP_LEAVE, { conversationId: groupId });

//       // Admin gets: MEMBER_LEFT
//       const leftEvent = await waitForEvent(adminSocket, SocketEvents.GROUP_MEMBER_LEFT);
//       expect(leftEvent.userId).toBe(userMember.id);

//       const memberRecord = await prisma.conversationMember.findUnique({
//         where: { conversationId_userId: { conversationId: groupId, userId: userMember.id } },
//       });
//       expect(memberRecord!.status).toBe(MemberStatus.LEFT);
//     });

//     it('Admin can transfer admin rights', async () => {
//         // Correct Event: GROUP_TRANSFER_ADMIN
//         adminSocket.emit(SocketEvents.GROUP_TRANSFER_ADMIN, {
//             conversationId: groupId,
//             newAdminId: userMember.id
//         });

//         // Wait for broadcast (GROUP_ADMIN_TRANSFERRED)
//         const event = await waitForEvent(memberSocket, SocketEvents.GROUP_ADMIN_TRANSFERRED);
//         expect(event.toUserId).toBe(userMember.id);
//         expect(event.fromUserId).toBe(userAdmin.id);

//         // Verify DB
//         const newAdmin = await prisma.conversationMember.findUnique({
//             where: { conversationId_userId: { conversationId: groupId, userId: userMember.id }}
//         });
//         const oldAdmin = await prisma.conversationMember.findUnique({
//             where: { conversationId_userId: { conversationId: groupId, userId: userAdmin.id }}
//         });

//         expect(newAdmin!.role).toBe(MemberRole.ADMIN);
//         expect(oldAdmin!.role).toBe(MemberRole.MEMBER);
//     });
//   });

//   // ==========================================
//   // SUITE 3: JOIN REQUEST SYSTEM
//   // ==========================================
//   describe('Suite 3: Join Requests', () => {
//     let approvalGroupId: string;

//     beforeEach(async () => {
//       const group = await prisma.conversation.create({
//         data: {
//           type: 'GROUP', name: 'Private Club', requireApproval: true, createdById: userAdmin.id,
//           members: { create: [{ userId: userAdmin.id, role: MemberRole.ADMIN }] },
//         },
//       });
//       approvalGroupId = group.id;
//     });

//     it('should create a PENDING request when joining private group', async () => {
//       // Correct Event: GROUP_REQUEST_JOIN
//       outsiderSocket.emit(SocketEvents.GROUP_REQUEST_JOIN, {
//         conversationId: approvalGroupId,
//         message: 'Let me in!',
//       });

//       // Admin gets: JOIN_REQUEST_RECEIVED
//       const adminNotif = await waitForEvent(adminSocket, SocketEvents.GROUP_JOIN_REQUEST_RECEIVED);
//       expect(adminNotif.requesterId).toBe(userOutsider.id);

//       const request = await prisma.groupJoinRequest.findUnique({
//         where: { conversationId_userId: { conversationId: approvalGroupId, userId: userOutsider.id } },
//       });

//       expect(request).not.toBeNull();
//       expect(request!.status).toBe(JoinRequestStatus.PENDING);
//     });

//     it('should add member when Admin approves request', async () => {
//       const request = await prisma.groupJoinRequest.create({
//         data: { conversationId: approvalGroupId, userId: userOutsider.id, status: JoinRequestStatus.PENDING },
//       });

//       // Correct Event: GROUP_REVIEW_JOIN
//       adminSocket.emit(SocketEvents.GROUP_REVIEW_JOIN, {
//         requestId: request.id,
//         approve: true,
//       });

//       // Outsider gets: JOIN_REQUEST_REVIEWED
//       const outsiderEvent = await waitForEvent(outsiderSocket, SocketEvents.GROUP_JOIN_REQUEST_REVIEWED);
//       expect(outsiderEvent.approved).toBe(true);

//       const memberRecord = await prisma.conversationMember.findUnique({
//         where: { conversationId_userId: { conversationId: approvalGroupId, userId: userOutsider.id } },
//       });

//       expect(memberRecord).not.toBeNull();
//       expect(memberRecord!.status).toBe(MemberStatus.ACTIVE);
//     });
//   });

//   // ==========================================
//   // SUITE 4: FEATURES (PIN MESSAGE)
//   // ==========================================
//   describe('Suite 4: Features', () => {
//       let groupId: string;
//       let messageId: bigint;

//       beforeEach(async () => {
//           // Create Group
//           const group = await prisma.conversation.create({
//               data: {
//                   type: 'GROUP', createdById: userAdmin.id,
//                   members: { create: [{ userId: userAdmin.id, role: MemberRole.ADMIN }] },
//               }
//           });
//           groupId = group.id;

//           // Create Message
//           const msg = await prisma.message.create({
//               data: { conversationId: groupId, senderId: userAdmin.id, content: 'Important Info' }
//           });
//           messageId = msg.id;
//       });

//       it('Admin can pin a message', async () => {
//           // Correct Event: GROUP_PIN_MESSAGE
//           adminSocket.emit(SocketEvents.GROUP_PIN_MESSAGE, {
//               conversationId: groupId,
//               messageId: messageId.toString() // Socket gửi string, logic service parse về BigInt
//           });

//           // Wait for broadcast (GROUP_MESSAGE_PINNED)
//           const event = await waitForEvent(adminSocket, SocketEvents.GROUP_MESSAGE_PINNED);
//           expect(event.conversationId).toBe(groupId);
//           expect(event.messageId).toBe(messageId.toString());

//           // Verify DB
//           const group = await prisma.conversation.findUnique({ where: { id: groupId }});
//           const settings = group!.settings as any;
//           expect(settings.pinnedMessages).toContain(messageId.toString());
//       });

//       it('Admin can unpin a message', async () => {
//           // Setup: Pin first
//           await prisma.conversation.update({
//               where: { id: groupId },
//               data: { settings: { pinnedMessages: [messageId.toString()] }}
//           });

//           // Action: Unpin (Correct Event: GROUP_UNPIN_MESSAGE)
//           adminSocket.emit(SocketEvents.GROUP_UNPIN_MESSAGE, {
//               conversationId: groupId,
//               messageId: messageId.toString()
//           });

//           // Wait for broadcast (GROUP_MESSAGE_UNPINNED)
//           const event = await waitForEvent(adminSocket, SocketEvents.GROUP_MESSAGE_UNPINNED);
//           expect(event.messageId).toBe(messageId.toString());
//       });
//   });
// });
