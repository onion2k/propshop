// Unit tests run in Node; a UI test asks for jsdom with a `// @vitest-environment jsdom` line at its top.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
