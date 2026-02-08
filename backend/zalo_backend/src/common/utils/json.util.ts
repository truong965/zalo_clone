/**
 * Serialize BigInt an toàn khi parse từ JSON (Input: Object -> Output: Object)
 */
export const safeJSON = <T>(data: T): T => {
  // Nếu data là undefined hoặc null, trả về nguyên bản ngay lập tức
  if (data === undefined || data === null) {
    return data;
  }

  return JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as T;
};

/**
 * ✅ NEW: Chuyển Object thành String an toàn với BigInt
 * (Input: Object -> Output: String)
 * Dùng cho: Redis set, Logging, ...
 */
export const safeStringify = (data: any): string => {
  // Xử lý trường hợp data undefined để tránh crash hoặc trả về undefined
  if (data === undefined) {
    return '';
  }

  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
};
