import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Cloudflare serves from the domain root — no `base` path. Anything that
  // builds an internal URL must go through `import.meta.env.BASE_URL`
  // (see src/lib/console/paths.ts) rather than hardcoding a prefix, so a
  // future host change stays a config edit.
  site: 'https://ks-mansion.pages.dev',
  adapter: cloudflare({
    // Workers has no sharp at runtime; optimize during the build instead.
    // Only prerendered (marketing) pages have images today.
    imageService: 'compile',
    // Emulate Cloudflare bindings (KV, secrets) in `astro dev`, so local
    // runs exercise the same session/credential surface as production.
    platformProxy: { enabled: true },
  }),
  i18n: {
    defaultLocale: 'th',
    locales: ['th', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  // The console needs a server: Sheets service-account credentials can't ship
  // to the browser, and admin auth needs a request-time gate. Marketing pages
  // opt back out with `export const prerender = true` and stay static.
  output: 'server',
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    optimizeDeps: {
      exclude: ['astro:transitions'],
    },
  },
});
