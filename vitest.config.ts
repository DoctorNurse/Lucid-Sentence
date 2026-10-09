import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Test against source so tests never depend on a stale build.
    alias: {
      '@lucid-sentence/commands': src('commands'),
      '@lucid-sentence/ribbon-ui': src('ribbon-ui'),
      '@lucid-sentence/splash': src('splash'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'happy-dom',
  },
});
