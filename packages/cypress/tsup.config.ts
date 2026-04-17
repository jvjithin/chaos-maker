import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/support.ts', 'src/tasks.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['cypress', '@chaos-maker/core'],
});
