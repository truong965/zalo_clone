// how to test
// docker-compose up -d
// npx dotenv -e .env.test -- npx prisma db push
// npx dotenv -e .env.test -- npm run test:e2e
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/database/prisma.service';
import { randomUUID } from 'node:crypto';
// 👇 1. Import SocketAuthService
import { SocketAuthService } from 'src/socket/services/socket-auth.service';

describe('Messaging E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let clientA: Socket;
  let clientB: Socket;
  // 👇 Token giả định
  const tokenA = 'mock-token-a';
  const tokenB = 'mock-token-b';

  let userA: any;
  let userB: any;
  let conversationId: string;

  // 👇 2. Tạo Mock Object cho AuthService
  const mockSocketAuthService = {
    authenticateSocket: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 👇 3. Ghi đè Service thật bằng Mock
      .overrideProvider(SocketAuthService)
      .useValue(mockSocketAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(8001); // Đổi port 8001 để tránh trùng

    prisma = app.get(PrismaService);

    // Clean DB
    await prisma.message.deleteMany();
    await prisma.conversationMember.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();

    // Create Users
    userA = await prisma.user.create({
      data: {
        phoneNumber: '+84900000001',
        displayName: 'Alice Test',
        passwordHash: 'hashed',
      },
    });

    userB = await prisma.user.create({
      data: {
        phoneNumber: '+84900000002',
        displayName: 'Bob Test',
        passwordHash: 'hashed',
      },
    });

    // 👇 4. Cấu hình Mock để trả về User đúng theo Token
    mockSocketAuthService.authenticateSocket.mockImplementation((client) => {
      const token = client.handshake.auth.token;
      if (token === tokenA) return userA; // Gặp tokenA thì trả về userA
      if (token === tokenB) return userB; // Gặp tokenB thì trả về userB
      return null;
    });

    // Setup Conversation
    const conv = await prisma.conversation.create({
      data: { type: 'DIRECT', createdById: userA.id },
    });
    await prisma.conversationMember.createMany({
      data: [
        { conversationId: conv.id, userId: userA.id, role: 'MEMBER' },
        { conversationId: conv.id, userId: userB.id, role: 'MEMBER' },
      ],
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  beforeEach((done) => {
    // Kết nối với Mock Token
    clientA = io('http://localhost:8001/socket.io', {
      auth: { token: tokenA },
      transports: ['websocket'],
    });

    clientB = io('http://localhost:8001/socket.io', {
      auth: { token: tokenB },
      transports: ['websocket'],
    });

    let connectedCount = 0;
    const onConnect = () => {
      connectedCount++;
      if (connectedCount === 2) done();
    };

    clientA.on('connect', onConnect);
    clientB.on('connect', onConnect);

    // 👇 Debug: Log lỗi nếu kết nối thất bại
    clientA.on('connect_error', (err) =>
      console.error('Client A Error:', err.message),
    );
    clientB.on('connect_error', (err) =>
      console.error('Client B Error:', err.message),
    );
  });

  afterEach(() => {
    clientA.disconnect();
    clientB.disconnect();
  });

  // ... (Giữ nguyên các test case cũ của bạn) ...

  // --- KỊCH BẢN 1: HAPPY PATH ---
  it('should send and receive message successfully', (done) => {
    const clientMessageId = randomUUID();
    const content = 'Hello Bob!';

    clientB.on('message:new', (data) => {
      try {
        expect(data.conversationId).toBe(conversationId);
        expect(data.message.content).toBe(content);
        expect(data.message.senderId).toBe(userA.id);
        done();
      } catch (err) {
        done(err);
      }
    });

    clientA.emit('message:send', {
      conversationId,
      clientMessageId,
      type: 'TEXT',
      content,
    });
  });

  // --- KỊCH BẢN 2: VALIDATION ERROR ---
  it('should return error when content is empty', (done) => {
    const clientMessageId = randomUUID();

    clientA.on('error', (data: any) => {
      try {
        expect(data).toBeDefined();

        // 👇 SỬA Ở ĐÂY: Check data.error thay vì data.message
        // Server trả về: { error: "Text message cannot be empty", ... }
        expect(data.error).toContain('cannot be empty');

        done();
      } catch (err) {
        done(err);
      }
    });

    clientA.emit('message:send', {
      conversationId,
      clientMessageId,
      type: 'TEXT',
      content: '', // Rỗng -> Server throw lỗi và Gateway bắt được
    });
  });

  // --- KỊCH BẢN 3: OFFLINE SYNC ---
  it('should queue messages for offline user and sync on reconnect', (done) => {
    const clientMessageId = randomUUID();
    const offlineContent = 'Message while Bob is offline';

    clientB.disconnect();

    clientA.emit('message:send', {
      conversationId,
      clientMessageId,
      type: 'TEXT',
      content: offlineContent,
    });

    setTimeout(() => {
      clientB.connect();
      clientB.on('messages:sync', (data) => {
        try {
          expect(data.count).toBeGreaterThanOrEqual(1);
          const syncedMsg = data.messages.find(
            (m: any) => m.content === offlineContent,
          );
          expect(syncedMsg).toBeDefined();
          done();
        } catch (err) {
          done(err);
        }
      });
    }, 1000); // Tăng timeout sync lên 1 chút
  });
});
