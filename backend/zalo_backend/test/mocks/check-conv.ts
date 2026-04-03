
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function checkConversation() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  
  const conversationId = '32cb3ae2-5fa9-42d4-9036-233651bd0edb';
  
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: true,
    }
  });
  
  if (!conv) {
    console.log('Conversation not found');
    const allUsers = await prisma.user.findMany({ take: 5 });
    console.log('Sample Users:', allUsers.map(u => ({ id: u.id, displayName: u.displayName })));
  } else {
    console.log('Conversation found:', conv.name);
    console.log('Members:', conv.members.length);
    const users = await prisma.user.findMany({
      where: { id: { in: conv.members.map(m => m.userId) } }
    });
    console.log('Member Details:', users.map(u => ({ id: u.id, displayName: u.displayName })));
  }
  
  await prisma.$disconnect();
}

checkConversation();
