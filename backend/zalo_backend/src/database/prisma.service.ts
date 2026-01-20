import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

// / Định nghĩa Interface cho dữ liệu Audit để tránh dùng 'any'
interface AuditData {
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
  deletedAt?: Date;
  [key: string]: unknown; // Cho phép các trường khác
}
// Interface cho Soft Delete Filter
interface SoftDeleteCriteria {
  deletedAt?: Date | null | object;
  [key: string]: unknown;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  // Cache để lưu danh sách các bảng có hỗ trợ các cột đặc biệt
  private modelsWithAudit = new Set<string>(); // Có createdById, updatedById
  private modelsWithSoftDelete = new Set<string>(); // Có deletedAt, deletedById
  constructor(private readonly cls: ClsService) {
    super();
  }

  get extended() {
    // 1. CAPTURE CONTEXT: Lưu các biến class vào biến cục bộ để dùng trong closure
    // Giúp tránh lỗi "this" bị undefined hoặc any bên trong $extends
    const cls = this.cls;
    const auditModels = this.modelsWithAudit;
    const softDeleteModels = this.modelsWithSoftDelete;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this; // Capture chính instance PrismaService để gọi lại hàm update

    return this.$extends({
      query: {
        $allModels: {
          // Dùng Arrow Function để code gọn hơn (dù đã capture biến ở trên)
          create: async ({ model, args, query }) => {
            const userId = cls.get<string>('userId'); // Định rõ kiểu trả về là string

            if (auditModels.has(model) && userId) {
              // Cast về AuditData thay vì any -> Type Safe hơn
              const data = args.data as AuditData;
              data.createdById = userId;
              data.updatedById = userId;
            }

            return query(args);
          },

          update: async ({ model, args, query }) => {
            const userId = cls.get<string>('userId');

            if (auditModels.has(model) && userId) {
              const data = args.data as AuditData;
              data.updatedById = userId;
            }

            return query(args);
          },

          updateMany: async ({ model, args, query }) => {
            const userId = cls.get<string>('userId');

            if (auditModels.has(model) && userId) {
              // Với updateMany, args.data cũng cần ép kiểu tương tự
              const data = args.data as AuditData;
              data.updatedById = userId;
            }

            return query(args);
          },

          delete: async ({ model, args, query }) => {
            if (softDeleteModels.has(model)) {
              const userId = cls.get<string>('userId');

              //truy cập model động (self[model]) trả về any,
              //eslint-disable-next-line
              return (self as any)[model].update({
                ...args,
                data: {
                  deletedAt: new Date(),
                  ...(userId ? { deletedById: userId } : {}),
                },
              });
            }

            return query(args);
          },

          deleteMany: async ({ model, args, query }) => {
            if (softDeleteModels.has(model)) {
              const userId = cls.get<string>('userId');
              //truy cập model động (self[model]) trả về any,
              // eslint-disable-next-line
              return (self as any)[model].updateMany({
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
            if (softDeleteModels.has(model)) {
              const where = (args.where || {}) as SoftDeleteCriteria;

              if (where.deletedAt === undefined) {
                where.deletedAt = null;
              }

              args.where = where;
            }
            return query(args);
          },

          findFirst: async ({ model, args, query }) => {
            if (softDeleteModels.has(model)) {
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
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to Database');

    // 1. INTROSPECTION: Soi Schema để xem bảng nào có cột nào
    // Prisma.dmmf chứa toàn bộ định nghĩa bảng của bạn
    const dmmf = Prisma.dmmf as Prisma.DMMF.Document;

    dmmf.datamodel.models.forEach((model) => {
      const fieldNames = model.fields.map((f) => f.name);

      // Check xem bảng có đủ cặp createdById & updatedById không
      if (
        fieldNames.includes('createdById') &&
        fieldNames.includes('updatedById')
      ) {
        this.modelsWithAudit.add(model.name);
      }

      // Check xem bảng có hỗ trợ Soft Delete không
      if (
        fieldNames.includes('deletedAt') &&
        fieldNames.includes('deletedById')
      ) {
        this.modelsWithSoftDelete.add(model.name);
      }
    });

    this.logger.log(
      `Audit Models detected: ${Array.from(this.modelsWithAudit).join(', ')}`,
    );
    this.logger.log(
      `Soft Delete Models detected: ${Array.from(this.modelsWithSoftDelete).join(', ')}`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
