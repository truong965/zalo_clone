// src/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Quan trọng: Global giúp bạn dùng PrismaService ở mọi nơi mà không cần import lại
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
