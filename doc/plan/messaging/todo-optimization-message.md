1. Redis Optimization
// Use pipeline for batch operations
async bulkEnqueueMessages(userId: string, messages: Message[]) {
  const pipeline = this.redis.pipeline();
  
  messages.forEach(msg => {
    pipeline.zadd(
      RedisKeys.cache.offlineMessages(userId),
      msg.createdAt.getTime(),
      JSON.stringify(msg)
    );
  });
  
  await pipeline.exec();
}

2. Query Optimization
// AVOID N+1 - Fetch senders in batch
async getMessagesWithSenders(conversationId: string) {
  return this.prisma.message.findMany({
    where: { conversationId },
    include: {
      sender: {
        select: { id: true, displayName: true, avatarUrl: true }
      }
    }
  });
}
3. Monitoring & Observability
// Add Prometheus metrics (optional)
import { Counter, Histogram } from 'prom-client';

const messagesSentCounter = new Counter({
  name: 'messages_sent_total',
  help: 'Total messages sent',
  labelNames: ['conversation_type'],
});

const messageLatency = new Histogram({
  name: 'message_delivery_latency_seconds',
  help: 'Message delivery latency',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// In sendMessage():
const startTime = Date.now();
messagesSentCounter.inc({ conversation_type: 'DIRECT' });

// After delivery:
messageLatency.observe((Date.now() - startTime) / 1000);