// test/mocks/file-type.mock.ts

// ✅ FIX: Bỏ 'async' và dùng Promise.resolve() để trả về Promise
export const fileTypeFromBuffer = (buffer: Buffer) => {
  // Logic giả lập đơn giản để pass test case JPEG
  // Magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return Promise.resolve({ ext: 'jpg', mime: 'image/jpeg' });
  }

  // Logic giả lập cho MP4 (Magic: ftyp)
  if (
    buffer.length > 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return Promise.resolve({ ext: 'mp4', mime: 'video/mp4' });
  }

  // Logic giả lập cho EXE (Magic: MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return Promise.resolve({ ext: 'exe', mime: 'application/x-dosexec' });
  }

  return Promise.resolve(undefined); // Unknown
};

// ✅ FIX: Bỏ 'async' và dùng Promise.resolve()
export const fileTypeFromFile = (path: string) => {
  return Promise.resolve({ ext: 'jpg', mime: 'image/jpeg' });
};
