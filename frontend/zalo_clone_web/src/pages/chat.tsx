// src/pages/chat/index.tsx
import { ChatFeature } from '@/features/chat';

// Đây là component sẽ được Router gọi
export function ChatPage() {
      return (
            // Không cần bọc ClientLayout ở đây nếu Router đã xử lý Layout
            // Nhưng nếu trang này cần SEO title hoặc logic riêng của trang thì viết ở đây
            <>
                  {/* <title>Tin nhắn | Zalo Clone</title> */}
                  <ChatFeature />
            </>
      );
}