import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE_URL = process.env.SITE_URL ?? 'https://mailwing.app';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'directory' },
  compressHTML: true,
  integrations: [sitemap()],
  vite: {
    resolve: {
      alias: { '@': '/src' },
    },
  },
});
