import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Test against source so tests never depend on a stale build.
    alias: {
      '@lucid-sentence/ai': src('ai'),
      '@lucid-sentence/commands': src('commands'),
      '@lucid-sentence/ribbon-ui': src('ribbon-ui'),
      '@lucid-sentence/splash': src('splash'),
      '@lucid-sentence/tokens': src('tokens'),
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/demo/test/**/*.test.ts',
      'scripts/test/**/*.test.ts',
    ],
    environment: 'happy-dom',
  },
});
