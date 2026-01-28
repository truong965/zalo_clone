// test/mocks/cuid2.mock.ts
export const createId = () => {
  // Tạo chuỗi ngẫu nhiên để đảm bảo Unique Key trong DB test
  return (
    'cuid' +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
};

export const init = () => createId;
export const isCuid = () => true;
export const getConstants = () => ({});
