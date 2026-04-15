import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        // Start lenient. Tighten as tests are added per CHECKLIST.md.
        // Final targets (enforced after Phase 2 complete): lines 80 / functions 80 / branches 70.
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
