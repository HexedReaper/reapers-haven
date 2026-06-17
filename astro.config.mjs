import { defineConfig } from 'astro/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  site: 'https://reapers-haven.pages.dev',
  base: '/',
  outDir: './dist',
  vite: {
    plugins: [viteSingleFile()]
  }
});