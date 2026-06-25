import { defineConfig } from 'astro/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  site: 'https://reapers-haven.pages.dev',
  base: '/',
  outDir: './dist',
  vite: {
    plugins: [viteSingleFile()],
    define: {
      // If env var is missing, fallback to my worker URL so my build doesn't break
      'import.meta.env.VAULT_REPORT_URL': JSON.stringify(process.env.VAULT_REPORT_URL || 'https://reapers-haven-typo-proxy.kranych.workers.dev/')
    }
  }
});