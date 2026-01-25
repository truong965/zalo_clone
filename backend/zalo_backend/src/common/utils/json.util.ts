import { Message } from '@prisma/client';

export const safeJSON = (data: any) => {
  return JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as Message;
};
