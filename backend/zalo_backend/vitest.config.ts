import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.spec.ts',
      'test/integration/**/*.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/test/e2e/**',
      '**/*.e2e-spec.ts',
    ],
    testTimeout: 10000,
    hookTimeout: 5000,
    setupFiles: ['test/setup.ts'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@common': path.resolve(__dirname, './src/common'),
      '@config': path.resolve(__dirname, './src/config'),
      '@database': path.resolve(__dirname, './src/database'),
    },
  },
});
