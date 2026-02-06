import { useState, useEffect, useRef, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';

// Định nghĩa kiểu dữ liệu trả về từ API (Pagination chuẩn)
interface PaginationResponse<T> {
      data: T[];
      meta: {
            nextCursor?: string;
            hasNextPage: boolean;
      };
}

interface UseInfiniteScrollOptions<T> {
      // Hàm gọi API, nhận vào cursor và trả về Promise data
      fetcher: (cursor?: string) => Promise<PaginationResponse<T>>;

      // Hướng dữ liệu: 
      // 'forward' (Conversation - nối đuôi) 
      // 'backward' (Message - nối đầu)
      direction?: 'forward' | 'backward';

      // Cấu hình cho Intersection Observer
      threshold?: number;
      rootMargin?: string;

      // Có kích hoạt fetch hay không (Ví dụ: skip khi đang initial load)
      enabled?: boolean;

      // Callback chạy SAU KHI data đã được update (Dùng để fix scroll position)
      onSuccess?: () => void;
}

export function useInfiniteScroll<T>({
      fetcher,
      direction = 'forward',
      threshold = 0.1,
      rootMargin = '100px',
      enabled = true,
      onSuccess
}: UseInfiniteScrollOptions<T>) {
      // --- STATE ---
      const [data, setData] = useState<T[]>([]);
      const [cursor, setCursor] = useState<string | undefined>(undefined);
      const [hasMore, setHasMore] = useState(false);
      const [isLoading, setIsLoading] = useState(false);

      // --- REFS (LOCKING MECHANISM) ---
      const isFetchingRef = useRef(false);

      // --- OBSERVER ---
      const { ref: loadMoreRef, inView } = useInView({
            threshold,
            rootMargin,
            skip: !enabled, // Tích hợp sẵn skip
      });

      // --- RESET FUNCTION (Dùng khi đổi conversation/tab) ---
      const reset = useCallback(() => {
            setData([]);
            setCursor(undefined);
            setHasMore(false);
            setIsLoading(false);
            isFetchingRef.current = false;
      }, []);

      // --- MANUAL SETTER (Dùng cho initial load bên ngoài) ---
      const setInitialData = useCallback((items: T[], nextCursor?: string, hasNext?: boolean) => {
            setData(items);
            setCursor(nextCursor);
            setHasMore(hasNext || false);
      }, []);

      // --- MAIN LOGIC (Copy chuẩn từ index.tsx cũ) ---
      useEffect(() => {
            // 1. Check Lock
            if (isFetchingRef.current) return;

            // 2. Check Conditions
            if (!enabled || !inView || !hasMore || isLoading) return;

            // 3. Lock & Loading
            isFetchingRef.current = true;
            setIsLoading(true);

            // Giả lập delay network (hoặc đợi animation frame)
            // Bạn có thể bỏ setTimeout này nếu API thật đã có độ trễ, 
            // nhưng giữ lại để an toàn UI như logic cũ.
            setTimeout(async () => {
                  try {
                        const response = await fetcher(cursor);

                        // Update Data dựa theo chiều (Direction)
                        setData(prev => {
                              if (direction === 'forward') {
                                    return [...prev, ...response.data]; // Nối đuôi (Conversation)
                              } else {
                                    // Reverse data mới lấy về trước khi nối đầu (Message logic)
                                    const sortedNewItems = [...response.data].reverse();
                                    return [...sortedNewItems, ...prev]; // Nối đầu
                              }
                        });

                        setCursor(response.meta.nextCursor);
                        setHasMore(response.meta.hasNextPage);

                        // Trigger callback (để tính toán lại scroll height bên component cha)
                        if (onSuccess) {
                              // Dùng requestAnimationFrame để đảm bảo DOM đã render xong data mới
                              requestAnimationFrame(() => onSuccess());
                        }

                  } catch (error) {
                        console.error("Fetch error:", error);
                  } finally {
                        // 4. Unlock sau delay nhỏ để ổn định
                        setTimeout(() => {
                              setIsLoading(false);
                              isFetchingRef.current = false;
                        }, 150);
                  }
            }, 500); // Delay 500ms như file cũ

      }, [inView, hasMore, isLoading, cursor, enabled, fetcher, direction, onSuccess]);

      return {
            data,
            setData, // Expose để có thể sửa đổi data thủ công (ví dụ: gửi tin nhắn mới)
            isLoading,
            hasMore,
            loadMoreRef,
            reset,
            setInitialData
      };
}