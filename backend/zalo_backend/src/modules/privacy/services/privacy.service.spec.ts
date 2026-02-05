import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrivacyService } from './privacy.service';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrivacyLevel } from '@prisma/client';
import socialConfig from '@config/social.config';

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
  let prisma: {
    privacySettings: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let redis: { get: ReturnType<typeof vi.fn>; setex: ReturnType<typeof vi.fn>; getClient: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      privacySettings: {
        findUnique: vi.fn().mockResolvedValue(mockPrivacySettings),
        findMany: vi.fn().mockResolvedValue([mockPrivacySettings]),
        update: vi.fn().mockResolvedValue({ ...mockPrivacySettings, whoCanMessageMe: PrivacyLevel.EVERYONE }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
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
      const emit = vi.fn();
      const module = await Test.createTestingModule({
        providers: [
          PrivacyService,
          { provide: PrismaService, useValue: prisma },
          { provide: RedisService, useValue: redis },
          { provide: EventEmitter2, useValue: { emit } },
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
      expect(emit).toHaveBeenCalledWith(
        'privacy.updated',
        expect.objectContaining({
          userId: 'user-1',
          settings: expect.any(Object),
        }),
      );
    });
  });
});
