import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

async function bootstrap() {
  console.log('--- AI Sync Connection Test (Model B) ---');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const embedQueue = app.get<Queue>(getQueueToken('embed'));
    
    console.log('Connecting to AI Redis (Port 6380)...');
    const job = await embedQueue.add('test-sync', {
      messageId: 'test-' + Date.now(),
      conversationId: '00000000-0000-0000-0000-000000000000',
      userId: 'test-user',
      text: 'Hello from Backend! This is a test for real-time synchronization.',
      createdAt: new Date().toISOString(),
    });

    console.log('Successfully pushed test job to AI Queue. Job ID:', job.id);
    console.log('Check the AI service logs for "Successfully indexed message" message.');
  } catch (err: any) {
    console.error('FAILED to push test job:', err.message);
  } finally {
    await app.close();
  }
}

bootstrap();
