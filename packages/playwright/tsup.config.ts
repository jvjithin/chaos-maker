import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/fixture.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['@playwright/test', '@chaos-maker/core'],
});
