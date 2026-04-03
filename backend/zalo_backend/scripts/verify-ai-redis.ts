import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.development.local from backend root
dotenv.config({ path: path.join(__dirname, '../.env.development.local') });

async function verifyAIConnect() {
  const redis = new Redis({
    host: process.env.AI_REDIS_HOST || 'localhost',
    port: parseInt(process.env.AI_REDIS_PORT || '6380', 10),
    password: process.env.AI_REDIS_PASSWORD || 'password123',
    db: parseInt(process.env.AI_REDIS_DB || '0', 10),
  });

  console.log(`Checking connection to AI Redis on ${redis.options.host}:${redis.options.port}...`);

  try {
    const pong = await redis.ping();
    console.log('--- SUCCESS: AI Redis is reachable (PONG)! ---');
    
    // Check if the 'embed' queue keys are there (just for fun)
    const keys = await redis.keys('bull:embed:*');
    console.log(`Found ${keys.length} keys related to BullMQ 'embed' queue.`);
  } catch (err: any) {
    console.error('--- FAILURE: Cannot connect to AI Redis ---');
    console.error(err.message);
  } finally {
    redis.disconnect();
  }
}

verifyAIConnect();
