import { registerAs } from '@nestjs/config';
import { permission } from 'process';

export default registerAs('social', () => ({
  limits: {
    // Giới hạn kết bạn
    friendRequest: {
      daily: parseInt(
        process.env.SOCIAL_FRIEND_REQUEST_DAILY_LIMIT || '20',
        10,
      ),
      weekly: parseInt(
        process.env.SOCIAL_FRIEND_REQUEST_WEEKLY_LIMIT || '100',
        10,
      ),
    },
    // Giới hạn đồng bộ danh bạ
    contactSync: {
      maxPerRequest: parseInt(
        process.env.SOCIAL_CONTACT_SYNC_MAX_SIZE || '500',
        10,
      ),
      maxPerDay: parseInt(
        process.env.SOCIAL_CONTACT_SYNC_DAILY_LIMIT || '3',
        10,
      ),
      windowSeconds: 86400, // 24 giờ
    },
  },
  cooldowns: {
    declineHours: 24, // Chờ 24h sau khi bị từ chối
    requestExpiryDays: 90, // Lời mời hết hạn sau 90 ngày
  },
  ttl: {
    // Redis TTL (seconds)
    // According to ARCHITECTURE.md Part 8:
    // - Permission cache: 5 minutes (frequently checked)
    // - Presence: 30 seconds
    // - Block status: 1 minute
    friendship: 60,
    friendList: 300,
    nameResolution: 1800, // 30 phút
    block: 60,
    privacy: 3600,
    permission: 300, // P2.4: 5 minutes (was 60 seconds) - FIX for cache strategy
  },
}));
