import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only — the Playwright suite in e2e/ has its own runner.
    include: ['src/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
});
