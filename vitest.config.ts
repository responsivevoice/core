import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    // Mirrors tsdown `define` so tests see the same compile-time constant.
    __RV_CORE_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
      thresholds: {
        // Global baseline thresholds
        statements: 90,
        branches: 85,
        functions: 85,
        lines: 90,

        // Critical modules - higher thresholds for core TTS logic
        'src/voice/**/*.ts': {
          statements: 95,
          branches: 90,
          functions: 90,
          lines: 95,
        },
        'src/text/**/*.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        'src/engines/**/*.ts': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },

        // Platform detection has many edge cases - standard threshold
        'src/platform/**/*.ts': {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
      },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});
