import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@prozo/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      '@prozo/finance': path.resolve(__dirname, './packages/finance/src/index.ts'),
      '@prozo/ai': path.resolve(__dirname, './packages/ai/src/index.ts')
    }
  }
});
