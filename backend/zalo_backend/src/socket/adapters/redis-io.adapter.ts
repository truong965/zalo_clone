import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { RedisService } from 'src/modules/redis/redis.service';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    // Lấy RedisService từ app context
    const redisService = this.app.get(RedisService);

    const pubClient = redisService.getPublisher();
    const subClient = redisService.getSubscriber();

    // KIỂM TRA QUAN TRỌNG: Đảm bảo client đã tồn tại
    if (!pubClient || !subClient) {
      this.logger.error(
        '⚠️ Redis Clients chưa được khởi tạo! Socket.IO sẽ chạy ở chế độ Memory (không dùng Redis Adapter).',
      );
      this.logger.error(
        'Hãy kiểm tra lại RedisService và đảm bảo kết nối Redis thành công trong onModuleInit.',
      );

      // Return server mặc định (Memory Adapter) để app không bị crash
      return server;
    }

    // Nếu có client, tiến hành gắn adapter
    try {
      const redisAdapter = createAdapter(pubClient, subClient);
      server.adapter(redisAdapter);
      this.logger.log('✅ Redis Adapter đã được gắn thành công vào Socket.IO');
    } catch (e) {
      this.logger.error('Lỗi khi tạo Redis Adapter:', e);
    }

    return server;
  }
}
