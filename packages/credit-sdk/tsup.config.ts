import { defineConfig } from 'tsup';
import { resolve } from 'path';

export default defineConfig({
  entry: {
    index: resolve(__dirname, 'src/index.ts'),
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  outDir: 'dist',
});