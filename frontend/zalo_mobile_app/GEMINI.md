# Zalo Mobile App — Project Rules

## Stack (EXACT VERSIONS — do not suggest alternatives)

| Layer | Library | Version |
|---|---|---|
| Runtime | Expo SDK | ~54.0.33 |
| Runtime | React Native | 0.81.5 |
| Runtime | React | 19.1.0 |
| Routing | Expo Router | ~6.0.23 |
| Styling | NativeWind | ^4.2.3 |
| Styling | Tailwind CSS | ^3.4.19 |
| State | Zustand | ^5.0.12 |
| Server State | TanStack Query | ^5.90.21 |
| Forms | React Hook Form + Zod | ^7.71.2 + ^4.3.6 |
| HTTP | Axios | ^1.13.6 |
| Lists | @shopify/flash-list | ^2.3.0 |
| Images | expo-image | ~3.0.11 |
| Animation | react-native-reanimated | ~4.1.1 |
| i18n | i18next + react-i18next | ^25 + ^16 |
| Errors | @sentry/react-native | ^8.4.0 |
| Auth | expo-secure-store + expo-local-authentication | |
| TypeScript | | ~5.9.2 strict |

---

## Architecture: Feature-Oriented (obytes pattern)

```
src/
├── app/                    # Expo Router routes — THIN re-exports only
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx       # export { LoginScreen as default } from '@/features/auth/login-screen'
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── contacts.tsx
│   │   └── settings.tsx
│   └── _layout.tsx
├── features/               # Feature modules — self-contained
│   ├── auth/
│   │   ├── login-screen.tsx
│   │   ├── use-auth-store.ts
│   │   ├── api.ts
│   │   └── components/
│   │       └── login-form.tsx
│   ├── chat/
│   │   ├── chat-screen.tsx
│   │   ├── conversation-screen.tsx
│   │   ├── api.ts
│   │   └── components/
│   │       ├── message-bubble.tsx
│   │       └── message-input.tsx
│   └── contacts/
│       ├── contacts-screen.tsx
│       ├── api.ts
│       └── components/
│           └── contact-card.tsx
├── components/
│   └── ui/                 # Design system — shared primitives only
│       ├── button.tsx
│       ├── text.tsx
│       ├── input.tsx
│       └── index.ts        # ONLY barrel export allowed
├── lib/                    # Core infrastructure
│   ├── api/
│   │   ├── client.ts       # Axios instance
│   │   └── provider.tsx    # TanStack Query provider
│   ├── auth/
│   │   └── token-storage.ts
│   ├── hooks/
│   ├── i18n/
│   └── storage.ts
└── translations/
    ├── vi.json
    └── en.json
```

---

## Code Rules

### TypeScript
- Strict mode bắt buộc — không dùng `any`
- Dùng `type` thay `interface` cho object shapes
- Type imports: `import type { Foo } from '...'`
- Không dùng non-null assertion (`!`) — handle explicitly

### Naming
- Files/folders: `kebab-case` (vd: `login-screen.tsx`, `use-auth-store.ts`)
- Components: `PascalCase`
- Variables/functions: `camelCase`
- Screens có suffix `-screen.tsx`
- Custom hooks có prefix `use-`
- Stores có suffix `-store.ts`
- API hooks trong `api.ts` của feature

### Imports
```ts
// ✅ ĐÚNG — absolute path đến file cụ thể
import { Button } from '@/components/ui/button';
import { LoginScreen } from '@/features/auth/login-screen';
import { useAuthStore } from '@/features/auth/use-auth-store';

// ✅ ĐÚNG — relative trong cùng feature
import { LoginForm } from './components/login-form';

// ❌ SAI — barrel export ngoài ui/
import { LoginScreen } from '@/features/auth';

// ❌ SAI — cross-feature relative
import { useAuthStore } from '../../auth/use-auth-store';
```

### Component Structure
```tsx
// ✅ Chuẩn
type Props = {
  userId: string;
  onPress: () => void;
};

export function UserCard({ userId, onPress }: Props) {
  // hooks ở trên
  // logic ở giữa  
  // return JSX ở dưới
}

// ❌ Không dùng default export trong features (chỉ app/ mới dùng)
```

---

## Anti-Patterns (NGHIÊM CẤM)

```
❌ FlatList                    → dùng FlashList từ @shopify/flash-list
❌ <Image> từ react-native     → dùng <Image> từ expo-image
❌ StyleSheet.create cho layout→ dùng NativeWind className
❌ AsyncStorage cho secrets    → dùng expo-secure-store
❌ any TypeScript type          → type cụ thể hoặc unknown
❌ Class components            → functional + hooks
❌ useNavigation() trực tiếp  → dùng expo-router hooks (useRouter, Link)
❌ String hardcode trong UI    → dùng t() từ react-i18next
❌ darkMode: 'class' trong tailwind config → để NativeWind tự xử lý
❌ styled() từ NativeWind v3  → đã bị xóa trong v4
❌ barrel exports ngoài ui/   → direct file imports
❌ index.ts trong features/   → gây fast refresh issues
```

---

## Skill files liên quan
@[nativewind-v4] @[expo-router-v3] @[tanstack-query-v5] @[zustand-v5] @[react-hook-form-zod]
