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
        // Ratchet: set to current actuals so coverage can only go UP.
        // These prevent regressions — adding code without tests will fail CI.
        lines: 70,
        functions: 65,
        branches: 50,
        statements: 70,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
