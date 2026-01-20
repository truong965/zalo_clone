import { Injectable, NotFoundException } from '@nestjs/common';
import aqp from 'api-query-params';

// Định nghĩa Interface chung cho Prisma Delegate (các hàm cơ bản)
export interface PrismaDelegate<T> {
  findMany(args?: any): Promise<T[]>;
  findUnique(args?: any): Promise<T | null>;
  findFirst(args?: any): Promise<T | null>; // Thêm cái này nếu cần
  create(args: { data: any }): Promise<T>;
  update(args: { where: any; data: any }): Promise<T>;
  delete(args: { where: any }): Promise<T>;

  // 👇 Sửa return type thành number | any để chấp nhận kiểu của Extension
  count(args?: any): Promise<number | any>;
}

@Injectable()
export abstract class BaseService<T> {
  // Model sẽ được truyền từ class con (vd: prisma.extended.user)
  constructor(protected readonly model: PrismaDelegate<T>) {}

  // 1. CREATE
  async create(data: any) {
    // Logic createdBy/updatedBy đã được PrismaService (Extension) tự xử lý
    // nhờ nestjs-cls, nên ở đây ta chỉ cần truyền data thô.
    return await this.model.create({ data });
  }

  // 2. FIND ALL (Tích hợp api-query-params)
  async findAll(currentPage: number, limit: number, qs: string) {
    const { filter, sort } = aqp(qs);

    // Xử lý Pagination
    const page = currentPage ? +currentPage : 1;
    const pageSize = limit ? +limit : 10;
    const skip = (page - 1) * pageSize;

    // Xử lý Sort: aqp trả về { field: 1 } (MongoDB style)
    // Prisma cần { field: 'asc' }
    const orderBy = Object.keys(sort).map((key) => ({
      [key]: sort[key] === 1 ? 'asc' : 'desc',
    }));

    // Xử lý Filter:
    // Lưu ý: aqp trả về regex kiểu MongoDB, Prisma không hiểu.
    // BaseService chỉ hỗ trợ filter bằng bằng (=).
    // Nếu muốn search like, class con phải override hoặc tự xử lý query string.
    delete filter.current;
    delete filter.pageSize;

    const [items, totalItems] = await Promise.all([
      this.model.findMany({
        where: filter, // Prisma tự map các field trùng tên
        skip,
        take: pageSize,
        orderBy: orderBy.length > 0 ? orderBy : undefined,
      }),
      this.model.count({ where: filter }),
    ]);

    return {
      meta: {
        current: page,
        pageSize: pageSize,
        pages: Math.ceil(totalItems / pageSize),
        total: totalItems,
      },
      result: items,
    };
  }

  // 3. FIND ONE
  async findOne(id: string) {
    const item = await this.model.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException(`Not found item with id: ${id}`);
    return item;
  }

  // 4. UPDATE
  async update(id: string, data: any) {
    await this.findOne(id); // Check tồn tại
    return await this.model.update({
      where: { id },
      data,
    });
  }

  // 5. REMOVE (Soft Delete đã được PrismaService xử lý)
  async remove(id: string) {
    await this.findOne(id);
    return await this.model.delete({
      where: { id },
    });
  }
}
