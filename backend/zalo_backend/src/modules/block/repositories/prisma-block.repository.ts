/**
 * Prisma implementation of Block Repository
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import type { IBlockRepository } from './block.repository.interface';

@Injectable()
export class PrismaBlockRepository implements IBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async exists(blockerId: string, blockedId: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        blockerId,
        blockedId,
      },
    });
    return count > 0;
  }

  async findByPair(
    blockerId: string,
    blockedId: string,
  ): Promise<import('@prisma/client').Block | null> {
    return this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });
  }
}
