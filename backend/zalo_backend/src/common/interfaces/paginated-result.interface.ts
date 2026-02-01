/**
 * 1. Dành cho Infinity Scroll (Mobile, Chat, Newsfeed)
 * Kiểu: Cursor-based Pagination
 */
export interface CursorPaginatedResult<T> {
  data: T[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor?: string; // Cursor cho lần call tiếp theo
    total?: number; // Optional: Đôi khi vẫn cần biết tổng số để hiện "Có 1000 kết quả"
  };
}

/**
 * 2. Dành cho Table/Grid (Admin Portal, CMS)
 * Kiểu: Offset-based Pagination (Page 1, Page 2...)
 */
export interface PagePaginatedResult<T> {
  data: T[]; // Hoặc dùng 'result' như bạn muốn, nhưng nên thống nhất là 'data' cho toàn project
  meta: {
    current: number; // Trang hiện tại
    pageSize: number; // Số item trên 1 trang
    total: number; // Tổng số items
    totalPages: number; // Tổng số trang = Math.ceil(total / pageSize)
  };
}
