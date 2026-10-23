import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any path (e.g. GitHub Pages).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
