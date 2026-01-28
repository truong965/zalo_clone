import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true, // Cho phép dùng describe, it, expect không cần import
    root: './',
    include: ['**/*.e2e-spec.ts', '**/*.spec.ts'], // Quét cả E2E và Unit test
    // ✅ Tăng timeout mặc định lên 60s (quan trọng cho test Video processing)
    testTimeout: 60000,
    alias: {
      // ✅ Map đường dẫn 'src/' giống như trong tsconfig
      src: path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    // ✅ Plugin quan trọng để NestJS Decorators hoạt động đúng
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
