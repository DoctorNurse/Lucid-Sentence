import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (pkg: string): string =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  // Relative base so the built demo can be opened from any path.
  base: './',
  resolve: {
    // Use workspace sources directly for instant reloads while developing.
    alias: {
      '@lucid-sentence/commands': src('commands'),
      '@lucid-sentence/ribbon-ui': src('ribbon-ui'),
    },
  },
});
