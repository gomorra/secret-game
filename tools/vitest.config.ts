import { defineConfig } from 'vitest/config';

/** Balance playtests: slow, so kept out of `npm test`. */
export default defineConfig({
  test: {
    include: ['tools/**/*.playtest.ts'],
    testTimeout: 600_000,
  },
});
