import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      // We only define the entry and global name here
      entry: 'src/index.ts',
      name: 'ChaosMaker',
    },
    rollupOptions: {
      // We explicitly define our two output formats as an array
      output: [
        {
          // This is the ES Module build
          format: 'es',
          entryFileNames: 'chaos-maker.js',
          dir: '../extension/dist',
        },
        {
          // This is the UMD build
          format: 'umd',
          // UMD builds must have a 'name'
          name: 'ChaosMaker', 
          entryFileNames: 'chaos-maker.umd.js',
          dir: '../extension/dist',
        },
      ],
    },
    // We keep outDir pointing to the extension's dist
    outDir: '../extension/dist',
    emptyOutDir: true, 
  },
});