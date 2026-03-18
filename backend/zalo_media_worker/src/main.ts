// src/main.ts
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // Use createApplicationContext because this is a worker without an HTTP server
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}
bootstrap();
