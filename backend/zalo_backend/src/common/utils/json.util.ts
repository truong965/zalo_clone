/**
 * Serialize BigInt an toàn khi parse từ JSON (Input: Object -> Output: Object)
 */
export const safeJSON = <T>(data: T): T => {
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
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
};
