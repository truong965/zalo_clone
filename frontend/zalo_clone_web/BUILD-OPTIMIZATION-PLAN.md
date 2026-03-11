# Build Optimization Plan — Code Splitting & Bundle Size

## Tình trạng hiện tại

```
dist/assets/daily-esm-C17EDuo3.js    246.72 kB │ gzip:  68.30 kB   ← Daily.co (đã tách nhờ dynamic import)
dist/assets/index-BYu3vMYO.js      2,907.29 kB │ gzip: 873.32 kB   ← ⚠️ MỌI THỨ CÒN LẠI
```

**Vấn đề:**
- 1 chunk duy nhất ~2.9MB chứa toàn bộ: React, Ant Design, Firebase, TanStack Query, Socket.IO, tất cả pages, tất cả features
- User chưa login vẫn phải tải admin pages, call screen, chat feature...
- Firebase warning: `firebase-messaging.ts` vừa bị static import (qua barrel `notification/index.ts`) vừa dynamic import (trong `auth.service.ts`) → Vite không thể tách chunk

---

## Mục tiêu

| Metric | Hiện tại | Mục tiêu |
|--------|---------|----------|
| Main chunk | 2,907 kB | < 500 kB |
| Số chunks | 2 | 8-12 |
| Admin bundle | Trong main chunk | Lazy chunk riêng |
| Firebase SDK | Trong main chunk | Lazy chunk riêng |
| First paint (login page) | Load ~3MB | Load < 500 kB |

---

## Phase 0 — Fix Firebase static/dynamic conflict warning

**File:** `src/features/notification/index.ts`

**Vấn đề:** `firebase-messaging.ts` được re-export trong barrel → bị static import bởi bất kỳ file nào import từ `@/features/notification`. Đồng thời `auth.service.ts` dùng `await import()` → Vite cảnh báo conflict vì module đã nằm trong main chunk.

**Fix:**
Xóa dòng `export * from './services/firebase-messaging'` khỏi `notification/index.ts`.

Đây là safe vì:
- `use-notification-permission.ts` import trực tiếp từ `../services/firebase-messaging` (relative path, không qua barrel)
- `auth.service.ts` dùng dynamic `await import('@/features/notification/services/firebase-messaging')` (direct path)
- Không file nào import `firebase-messaging` qua barrel `@/features/notification`

**Impact:** Warning biến mất. Firebase messaging code giờ chỉ được kéo vào qua 2 import paths trực tiếp, Vite có thể optimize tốt hơn.

---

## Phase 1 — Lazy load tất cả route pages

**File:** `src/routes/index.tsx`

**Nguyên lý:** Mỗi page component được wrap trong `React.lazy()` → Vite tự tạo chunk riêng cho từng page. User chỉ tải page đang truy cập.

### Trước:
```tsx
import { ChatPage } from '@/pages/chat';
import { ContactsPage } from '@/pages/contacts';
// ...8 static imports...

element: <ChatPage />
```

### Sau:
```tsx
import { lazy, Suspense } from 'react';

const ChatPage = lazy(() => import('@/pages/chat'));
const ContactsPage = lazy(() => import('@/pages/contacts'));
const CallsPage = lazy(() => import('@/pages/calls'));
const ProfilePage = lazy(() => import('@/pages/profile'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const CallScreen = lazy(() => import('@/features/call/components/CallScreen'));

// Auth pages
const LoginPage = lazy(() => import('@/pages/login'));
const RegisterPage = lazy(() => import('@/pages/register'));

// Admin pages — toàn bộ admin bundle tách riêng
const AdminDashboardPage = lazy(() => import('@/pages/admin/dashboard'));
const AdminUsersPage = lazy(() => import('@/pages/admin/users'));
const AdminMessagesPage = lazy(() => import('@/pages/admin/messages'));
const AdminCallsPage = lazy(() => import('@/pages/admin/calls'));
const AdminActivityPage = lazy(() => import('@/pages/admin/activity'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/settings'));

// Wrap mỗi element trong Suspense
element: (
  <Suspense fallback={<PageSkeleton />}>
    <ChatPage />
  </Suspense>
)
```

### Yêu cầu phụ:
- Mỗi page file cần có `export default` (hiện tại dùng named export → cần thêm `export default` hoặc dùng pattern `lazy(() => import(...).then(m => ({ default: m.ChatPage })))`)
- Tạo component `PageSkeleton` (hoặc dùng `Spin` của Ant Design) làm fallback loading

### Impact ước tính:
- Admin pages: ~200-300 kB tách riêng (chỉ load khi vào `/admin`)
- CallScreen: ~150 kB tách riêng (chỉ load khi vào call)
- Login/Register: chunk riêng (không load khi đã auth)

---

## Phase 2 — manualChunks cho vendor libraries

**File:** `vite.config.ts`

Tách các thư viện nặng thành vendor chunks riêng. Lợi ích: browser cache từng vendor chunk, khi update code app → vendor chunks không đổi hash → user không phải tải lại.

### Config:
```ts
export default defineConfig({
  // ...plugins, resolve...
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core (~140 kB)
          'vendor-react': [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          // Ant Design (~600 kB) — thư viện nặng nhất
          'vendor-antd': [
            'antd',
            '@ant-design/icons',
          ],
          // TanStack Query (~50 kB)
          'vendor-tanstack': [
            '@tanstack/react-query',
            '@tanstack/react-virtual',
          ],
          // Firebase SDK (~200 kB)
          'vendor-firebase': [
            'firebase/app',
            'firebase/messaging',
          ],
          // Socket.IO client (~60 kB)
          'vendor-socketio': [
            'socket.io-client',
          ],
        },
      },
    },
  },
})
```

### Impact ước tính:
```
vendor-react.js      ~140 kB │ gzip:  ~45 kB   (cached lâu dài)
vendor-antd.js       ~600 kB │ gzip: ~180 kB   (cached lâu dài)
vendor-tanstack.js    ~50 kB │ gzip:  ~15 kB   (cached lâu dài)
vendor-firebase.js   ~200 kB │ gzip:  ~55 kB   (lazy — chỉ load khi cần push notification)
vendor-socketio.js    ~60 kB │ gzip:  ~18 kB   (cached lâu dài)
daily-esm.js         ~247 kB │ gzip:  ~68 kB   (lazy — chỉ load khi vào call)
index.js (app code)  ~400 kB │ gzip: ~120 kB   ← chỉ còn app logic
+ các page chunks      ~50-150 kB mỗi chunk
```

---

## Phase 3 — Lazy load Firebase SDK (optional, high impact)

Firebase SDK (~200 kB) chỉ cần khi user grant notification permission. Hiện tại nó luôn nằm trong main bundle vì `firebase/app` và `firebase/messaging` được import trực tiếp trong `config/firebase.ts`.

**Fix tiềm năng:** Chuyển `config/firebase.ts` sang dynamic import pattern:
```ts
// Thay vì import trực tiếp ở top level
// import { initializeApp } from 'firebase/app';

// Dùng dynamic import
export async function getFirebaseApp() {
  const { initializeApp } = await import('firebase/app');
  // ...
}
```

**Rủi ro:** Cần kiểm tra kỹ vì `use-notification-permission.ts` gọi Firebase khi mount. Nếu component mount ở authenticated layout → Firebase vẫn load sớm cho user đã auth (nhưng user chưa auth thì không load).

**Đề xuất:** Làm sau Phase 1+2, đo lại bundle size rồi quyết định.

---

## Thứ tự thực hiện

| Phase | Scope | Risk | Effort | Giảm main chunk |
|-------|-------|------|--------|----------------|
| 0 | Fix Firebase warning | Không | 1 dòng | 0 kB (fix warning) |
| 1 | Lazy load routes | Thấp | ~14 files | ~500 kB+ (admin + call + auth) |
| 2 | manualChunks vendor | Không | 1 file | ~1,100 kB (tách vendor → cache) |
| 3 | Lazy Firebase SDK | Trung bình | 2-3 files | ~200 kB |

**Khuyến nghị:** Phase 0 → 1 → 2 có thể làm cùng 1 commit. Phase 3 tùy chọn.

---

## Kết quả mong đợi sau Phase 0-2

```
dist/assets/vendor-react-{hash}.js      ~140 kB │ gzip:  ~45 kB
dist/assets/vendor-antd-{hash}.js       ~600 kB │ gzip: ~180 kB
dist/assets/vendor-tanstack-{hash}.js    ~50 kB │ gzip:  ~15 kB
dist/assets/vendor-firebase-{hash}.js   ~200 kB │ gzip:  ~55 kB
dist/assets/vendor-socketio-{hash}.js    ~60 kB │ gzip:  ~18 kB
dist/assets/daily-esm-{hash}.js         ~247 kB │ gzip:  ~68 kB
dist/assets/index-{hash}.js             ~400 kB │ gzip: ~120 kB  ← app shell + shared logic
dist/assets/chat-{hash}.js              ~100 kB │ gzip:  ~30 kB  ← lazy
dist/assets/admin-{hash}.js             ~200 kB │ gzip:  ~60 kB  ← lazy (admin only)
dist/assets/call-{hash}.js              ~100 kB │ gzip:  ~30 kB  ← lazy
dist/assets/auth-{hash}.js               ~50 kB │ gzip:  ~15 kB  ← lazy
...các page chunks khác
```

**Không chunk nào vượt 500 kB** → warning biến mất.

---

## Checklist trước khi implement

- [ ] Mỗi page file (`src/pages/*.tsx`) cần có `export default` để compatible với `React.lazy()`
- [ ] Tạo `PageSkeleton` / `PageLoader` component cho Suspense fallback
- [ ] Xóa `firebase-messaging` khỏi notification barrel export
- [ ] Thêm `build.rollupOptions.output.manualChunks` vào `vite.config.ts`
- [ ] Build local (`npm run build`) và verify chunk sizes
- [ ] Test navigation giữa các page (lazy load hoạt động đúng)
- [ ] Deploy lên Vercel và verify production build
