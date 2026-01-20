/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { Pool } from 'pg';

interface AuditData {
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
  deletedAt?: Date;
  [key: string]: unknown;
}

interface SoftDeleteCriteria {
  deletedAt?: Date | null | object;
  [key: string]: unknown;
}

// 1. TÁCH LOGIC TẠO CLIENT RA HÀM RIÊNG (PURE FUNCTION)
// Để TypeScript có thể suy luận (Infer) được Type trả về
const createExtendedClient = (
  baseClient: PrismaClient,
  cls: ClsService,
  sets: {
    create: Set<string>;
    update: Set<string>;
    softDelete: Set<string>;
  },
  logger: Logger,
) => {
  return baseClient.$extends({
    query: {
      $allModels: {
        create: async ({ model, args, query }) => {
          const userId = cls.get<string>('userId');
          if (sets.create.has(model) && userId) {
            const data = args.data as AuditData;
            data.createdById = userId;
            if (sets.update.has(model)) {
              data.updatedById = userId;
            }
          }
          return query(args);
        },

        update: async ({ model, args, query }) => {
          const userId = cls.get<string>('userId');
          if (sets.update.has(model) && userId) {
            const data = args.data as AuditData;
            data.updatedById = userId;
          }
          return query(args);
        },

        updateMany: async ({ model, args, query }) => {
          const userId = cls.get<string>('userId');
          if (sets.update.has(model) && userId) {
            const data = args.data as AuditData;
            data.updatedById = userId;
          }
          return query(args);
        },

        delete: async ({ model, args, query }) => {
          if (sets.softDelete.has(model)) {
            const userId = cls.get<string>('userId');
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);

            // Note: Ở đây ta dùng 'any' tạm thời để truy cập dynamic key,
            // nhưng type trả về của cả hàm này vẫn được TS hiểu đúng.
            const extendedClient = baseClient as any;

            if (!extendedClient[modelKey]) {
              logger.error(`Model delegate for ${modelKey} not found!`);
              return query(args);
            }

            const data: any = {
              deletedAt: new Date(),
              ...(userId ? { deletedById: userId } : {}),
            };

            // Nếu là model User thì cập nhật thêm status
            // Prisma tự động hiểu string 'DELETED' map vào Enum UserStatus.DELETED
            if (model === 'User') {
              data.status = 'DELETED';
            }

            return extendedClient[modelKey].update({
              ...args,
              data,
            });
          }
          return query(args);
        },

        deleteMany: async ({ model, args, query }) => {
          if (sets.softDelete.has(model)) {
            const userId = cls.get<string>('userId');
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            const extendedClient = baseClient as any;

            if (!extendedClient[modelKey]) {
              logger.error(`Model delegate for ${modelKey} not found!`);
              return query(args);
            }

            return extendedClient[modelKey].updateMany({
              ...args,
              data: {
                deletedAt: new Date(),
                ...(userId ? { deletedById: userId } : {}),
              },
            });
          }
          return query(args);
        },

        findMany: async ({ model, args, query }) => {
          if (sets.softDelete.has(model)) {
            const where = (args.where || {}) as SoftDeleteCriteria;
            if (where.deletedAt === undefined) {
              where.deletedAt = null;
            }
            args.where = where;
          }
          return query(args);
        },

        findFirst: async ({ model, args, query }) => {
          if (sets.softDelete.has(model)) {
            const where = (args.where || {}) as SoftDeleteCriteria;
            if (where.deletedAt === undefined) {
              where.deletedAt = null;
            }
            args.where = where;
          }
          return query(args);
        },
      },
    },
  });
};

//  XUẤT TYPE CỦA CLIENT ĐÃ EXTEND RA NGOÀI
export type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  private modelsWithCreateBy = new Set<string>();
  private modelsWithUpdateBy = new Set<string>();
  private modelsWithSoftDelete = new Set<string>();

  //  SỬ DỤNG TYPE ĐÃ ĐỊNH NGHĨA (KHÔNG CÒN LÀ ANY NỮA)
  private _extendedClient: ExtendedPrismaClient;

  constructor(
    private readonly cls: ClsService,
    private readonly configService: ConfigService,
  ) {
    const connectionString = configService.get<string>('DATABASE_URL');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });

    // 4. GỌI HÀM HELPER ĐỂ TẠO CLIENT
    this._extendedClient = createExtendedClient(
      this,
      this.cls,
      {
        create: this.modelsWithCreateBy,
        update: this.modelsWithUpdateBy,
        softDelete: this.modelsWithSoftDelete,
      },
      this.logger,
    );
  }

  // Getter bây giờ đã có Type xịn
  get extended(): ExtendedPrismaClient {
    return this._extendedClient;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to Database');

    const dmmf = Prisma.dmmf as Prisma.DMMF.Document;
    dmmf.datamodel.models.forEach((model) => {
      const fieldNames = model.fields.map((f) => f.name);

      if (fieldNames.includes('createdById')) {
        this.modelsWithCreateBy.add(model.name);
      }
      if (fieldNames.includes('updatedById')) {
        this.modelsWithUpdateBy.add(model.name);
      }
      if (
        fieldNames.includes('deletedAt') &&
        fieldNames.includes('deletedById')
      ) {
        this.modelsWithSoftDelete.add(model.name);
      }
    });

    this.logger.log(`Audit Init Completed`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
