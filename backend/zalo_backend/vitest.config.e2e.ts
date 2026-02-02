// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 300000, // 5 minutes for E2E tests
    hookTimeout: 60000, // 1 minute for hooks
    teardownTimeout: 30000,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
      ],
    },
    // Run tests sequentially to avoid conflicts
    // threads: false,
    // isolate: false,
    // Retry failed tests
    retry: 0, // Don't retry by default (for debugging)
    // Show full diffs
    diff: {
      truncateThreshold: 0, // 0 = Không bao giờ cắt bớt output
      printBasicPrototype: false, // (Tuỳ chọn) Giúp output gọn hơn bằng cách ẩn prototype
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
});
