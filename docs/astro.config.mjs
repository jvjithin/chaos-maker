import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const skipAutoSitemap = {
  name: '@astrojs/sitemap',
  hooks: {},
};

export default defineConfig({
  site: 'https://chaos-maker-dev.github.io/chaos-maker',
  base: '/chaos-maker',
  integrations: [
    // Starlight auto-adds @astrojs/sitemap when `site` is set. The docs release
    // plan only requires Pagefind search and GitHub Pages deployment.
    skipAutoSitemap,
    starlight({
      title: 'Chaos Maker',
      description: 'Frontend chaos engineering toolkit for testing resilience across Playwright, Cypress, WebdriverIO, and Puppeteer.',
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/chaos-maker-dev/chaos-maker' },
      ],
      editLink: {
        baseUrl: 'https://github.com/chaos-maker-dev/chaos-maker/edit/main/docs/',
      },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Install', link: '/getting-started/install/' },
            { label: 'Playwright', link: '/getting-started/playwright/' },
            { label: 'Cypress', link: '/getting-started/cypress/' },
            { label: 'WebdriverIO', link: '/getting-started/webdriverio/' },
            { label: 'Puppeteer', link: '/getting-started/puppeteer/' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Chaos Types', link: '/concepts/chaos-types/' },
            { label: 'Service Worker Chaos', link: '/concepts/service-worker-chaos/' },
            { label: 'SSE Chaos', link: '/concepts/sse-chaos/' },
            { label: 'Presets', link: '/concepts/presets/' },
            { label: 'Config Builder', link: '/concepts/builder/' },
            { label: 'Seeded Reproducibility', link: '/concepts/seeded-reproducibility/' },
            { label: 'Nth Counting', link: '/concepts/nth-counting/' },
            { label: 'Observability', link: '/concepts/observability/' },
          ],
        },
        {
          label: 'Adapters',
          items: [
            { label: 'Playwright', link: '/adapters/playwright/' },
            { label: 'Cypress', link: '/adapters/cypress/' },
            { label: 'WebdriverIO', link: '/adapters/webdriverio/' },
            { label: 'Puppeteer', link: '/adapters/puppeteer/' },
          ],
        },
        {
          label: 'Recipes',
          items: [
            { label: 'Slow Checkout', link: '/recipes/slow-checkout/' },
            { label: 'Flaky API with Retries', link: '/recipes/flaky-api-with-retries/' },
            { label: 'Abort Upload Midflight', link: '/recipes/abort-upload-midflight/' },
            { label: 'WebSocket Storm', link: '/recipes/ws-disconnect-storm/' },
            { label: 'Degraded UI Buttons', link: '/recipes/degraded-ui-buttons/' },
            { label: 'Nth Request Fails', link: '/recipes/nth-request-fails/' },
            { label: 'CORS Preflight Block', link: '/recipes/cors-preflight-block/' },
            { label: 'Corrupt JSON Response', link: '/recipes/corrupt-json-response/' },
            { label: 'AI Chat SSE Streaming', link: '/recipes/ai-chat-streaming-sse/' },
            { label: 'Fail GraphQL Operation', link: '/recipes/fail-graphql-operation/' },
          ],
        },
        {
          label: 'API',
          items: [
            { label: 'Core', link: '/api/core/' },
            { label: 'Config Reference', link: '/api/config-reference/' },
          ],
        },
        {
          label: 'Rationale',
          items: [
            { label: 'Why Frontend Chaos?', link: '/rationale/why-frontend-chaos/' },
          ],
        },
      ],
    }),
  ],
});
