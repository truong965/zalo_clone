import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrivacyService } from './privacy.service';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import socialConfig from '@config/social.config';
import { EventPublisher } from '@shared/events';
import { PrivacyLevel } from '@prisma/client';

const mockPrivacySettings = {
  userId: 'user-1',
  showProfile: PrivacyLevel.EVERYONE,
  whoCanMessageMe: PrivacyLevel.CONTACTS,
  whoCanCallMe: PrivacyLevel.CONTACTS,
  showOnlineStatus: true,
  showLastSeen: true,
  updatedAt: new Date(),
  createdAt: new Date(),
  updatedById: null,
};

describe('PrivacyService', () => {
  let service: PrivacyService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      privacySettings: {
        findUnique: vi.fn().mockResolvedValue(mockPrivacySettings),
        findMany: vi.fn().mockResolvedValue([mockPrivacySettings]),
        update: vi.fn().mockResolvedValue({
          ...mockPrivacySettings,
          whoCanMessageMe: PrivacyLevel.EVERYONE,
        }),
        create: vi.fn().mockResolvedValue(mockPrivacySettings),
      },
    };

    const redisClient = {
      mget: vi.fn().mockResolvedValue([]),
      pipeline: vi.fn(() => ({
        setex: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      })),
    };

    redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(undefined),
      deletePattern: vi.fn().mockResolvedValue(0),
      getClient: vi.fn().mockReturnValue(redisClient),
    };

    const eventPublisher = {
      publish: vi.fn().mockResolvedValue('evt-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EventPublisher, useValue: eventPublisher },
        {
          provide: socialConfig.KEY,
          useValue: {
            ttl: { privacy: 3600, permission: 300 },
          },
        },
      ],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return settings from DB when cache miss', async () => {
      const result = await service.getSettings('user-1');

      expect(prisma.privacySettings.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
    });

    it('should create default settings when none exist', async () => {
      prisma.privacySettings.findUnique.mockResolvedValueOnce(null);

      const result = await service.getSettings('user-1');

      expect(result).toBeDefined();
      expect(result.whoCanMessageMe).toBeDefined();
    });
  });

  describe('updateSettings', () => {
    it('should update and emit privacy.updated event', async () => {
      const publish = vi.fn().mockResolvedValue('evt-1');
      const module = await Test.createTestingModule({
        providers: [
          PrivacyService,
          { provide: PrismaService, useValue: prisma },
          { provide: RedisService, useValue: redis },
          { provide: EventPublisher, useValue: { publish } },
          {
            provide: socialConfig.KEY,
            useValue: { ttl: { privacy: 3600, permission: 300 } },
          },
        ],
      }).compile();

      const svc = module.get<PrivacyService>(PrivacyService);

      await svc.updateSettings('user-1', {
        whoCanMessageMe: PrivacyLevel.EVERYONE,
      });

      expect(prisma.privacySettings.update).toHaveBeenCalled();
      expect(publish).toHaveBeenCalled();
    });
  });
});
