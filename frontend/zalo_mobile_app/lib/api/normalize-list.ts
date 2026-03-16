export function normalizeList<T>(payload: unknown): T[] {
      if (Array.isArray(payload)) {
            return payload as T[];
      }

      if (payload && typeof payload === 'object') {
            if ('items' in payload && Array.isArray(payload.items)) {
                  return payload.items as T[];
            }

            if ('data' in payload && Array.isArray(payload.data)) {
                  return payload.data as T[];
            }
      }

      return [];
}
