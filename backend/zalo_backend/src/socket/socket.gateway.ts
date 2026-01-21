import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'; // Giả định bạn dùng @nestjs/jwt
import { ConfigService } from '@nestjs/config';
import { SocketService } from './socket.service';
import { JwtPayload } from 'src/modules/auth/interfaces/jwt-payload.interface';
// Định nghĩa kiểu cho Auth Handshake để tránh dùng any
interface SocketAuth {
  token?: string;
}
@WebSocketGateway({
  /**
   * [CORS FIX] Bảo mật kết nối WebSocket
   * LOGIC:
   * - Thay vì để origin: '*', ta sử dụng callback để kiểm tra nguồn gốc request.
   * - Chỉ cho phép các domain trong Whitelist (Localhost, Frontend URL, Admin URL).
   *
   * MỤC ĐÍCH:
   * - Ngăn chặn tấn công CSWSH (Cross-Site WebSocket Hijacking).
   * - Đảm bảo chỉ client hợp lệ của hệ thống mới kết nối được.
   */
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.FRONTEND_URL,
        process.env.ADMIN_URL,
      ].filter(Boolean);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    //     methods: ['GET', 'POST'],
  },
  //   namespace: '',
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SocketGateway.name);
  private userSocketMap = new Map<string, Set<string>>();
  private readonly allowedOrigins: string[];

  constructor(
    private readonly socketService: SocketService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      this.configService.get<string>('FRONTEND_URL'),
      this.configService.get<string>('ADMIN_URL'),
    ].filter((origin): origin is string => Boolean(origin));

    this.logger.log(`Allowed CORS origins: ${this.allowedOrigins.join(', ')}`);
  }

  afterInit(server: Server) {
    // Inject server instance vào Service để dùng ở nơi khác
    this.socketService.setServer(server);
    this.logger.log('WebSocket Gateway Initialized');
  }

  /**
   * Xử lý khi Client kết nối
   * 1. Lấy Token từ Handshake Auth hoặc Query
   * 2. Validate Token
   * 3. Join User vào Room riêng
   */
  async handleConnection(client: Socket) {
    const origin = client.handshake.headers.origin;

    if (origin && !this.allowedOrigins.includes(origin)) {
      this.logger.warn(
        `Rejected connection from unauthorized origin: ${origin}`,
      );
      client.disconnect();
      return;
    }

    try {
      // Client sẽ gửi token dạng: { auth: { token: "Bearer eyJ..." } }
      // Hoặc query param: ?token=eyJ...
      const token = this.extractTokenFromHeader(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} không có token -> Disconnect`);
        client.disconnect();
        return;
      }

      // Verify Token (Lấy Secret từ Env)
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      // --- AUTH CHECK NÂNG CAO (Optional - Giống JwtStrategy) ---
      // Nếu muốn chặt chẽ như HTTP, bạn nên check thêm passwordVersion ở đây.
      // Tuy nhiên với socket handshake, check verify signature là mức tối thiểu chấp nhận được.

      // Lưu thông tin user vào socket instance để dùng sau này (nếu cần)
      client.data.userId = payload.sub; // sub là userId trong JWT chuẩn

      // [LOGIC] Mapping User <-> Socket ID
      // Lưu danh sách socket ID vào Map theo User ID để khi Worker báo xong, ta biết gửi cho socket nào.
      // (Lưu ý: Logic này lưu trên RAM, cần Redis Adapter nếu scale nhiều server)
      if (!this.userSocketMap.has(client.data.userId)) {
        this.userSocketMap.set(client.data.userId, new Set());
      }
      this.userSocketMap.get(client.data.userId)!.add(client.id);
      // *** QUAN TRỌNG: JOIN ROOM ***
      const userRoom = `user_${payload.sub}`;
      await client.join(userRoom);

      this.logger.log(
        `User [${payload.sub}] đã kết nối - SocketID: [${client.id}] - Joined Room: [${userRoom}]`,
      );
    } catch (err) {
      this.logger.error(`Connection Unauthorized: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId) {
      const userSockets = this.userSocketMap.get(client.data.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userSocketMap.delete(client.data.userId);
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
    // Socket.io tự động remove client khỏi các room khi disconnect, không cần code thêm.
  }

  private extractTokenFromHeader(client: Socket): string | undefined {
    const auth = client.handshake.auth as Record<string, unknown>;
    const headers = client.handshake.headers as Record<string, unknown>;

    // Lấy token raw
    const tokenRaw = (auth.token ||
      headers.authorization ||
      client.handshake.query.token) as string | undefined;

    if (!tokenRaw) return undefined;

    // Xử lý Bearer Token
    const [type, token] = tokenRaw.split(' ');

    // Nếu client gửi dạng "Bearer <token>"
    if (type === 'Bearer' && token) return token;

    // Nếu client chỉ gửi raw token (thường gặp ở query param)
    return type;
  }
  getActiveConnections(): number {
    let total = 0;
    this.userSocketMap.forEach((sockets) => {
      total += sockets.size;
    });
    return total;
  }

  getActiveUsers(): number {
    return this.userSocketMap.size;
  }
}
