import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, 'src/content/docs');

const skipAutoSitemap = {
  name: '@astrojs/sitemap',
  hooks: {},
};

// Discover the version directories laid down by scripts/build-versioned-docs.mjs.
// Slugs look like `v0-4-0`; the optional `main` directory is the unreleased
// preview written only when the script is run with `--dev`.
function discoverVersions() {
  let entries;
  try {
    entries = readdirSync(DOCS_ROOT, { withFileTypes: true });
  } catch {
    return { versionDirs: [], hasMain: false };
  }
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^v\d+-\d+-\d+/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => {
      const ka = a.split('-').slice(0, 3).map(Number);
      const kb = b.split('-').slice(0, 3).map(Number);
      for (let i = 0; i < 3; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return 0;
    })
    .reverse();
  const hasMain = entries.some((e) => e.isDirectory() && e.name === 'main');
  return { versionDirs, hasMain };
}

function slugToTag(slug) {
  return slug.replace(/-/g, '.');
}

const { versionDirs, hasMain } = discoverVersions();

const versionsGroup = {
  label: 'Versions',
  items: [
    { label: 'Latest', link: '/latest/' },
    ...versionDirs.map((slug) => ({
      label: slugToTag(slug),
      link: `/${slug}/`,
    })),
    ...(hasMain ? [{ label: 'main (unreleased)', link: '/main/' }] : []),
  ],
};

const versionAutogenerates = [
  {
    label: 'Latest docs',
    autogenerate: { directory: 'latest' },
  },
  ...versionDirs.map((slug) => ({
    label: `${slugToTag(slug)} archive`,
    collapsed: true,
    autogenerate: { directory: slug },
  })),
  ...(hasMain
    ? [{
        label: 'main (unreleased)',
        collapsed: true,
        autogenerate: { directory: 'main' },
      }]
    : []),
];

export default defineConfig({
  site: 'https://chaos-maker-dev.github.io/chaos-maker',
  base: '/chaos-maker',
  integrations: [
    skipAutoSitemap,
    starlight({
      title: 'Chaos Maker',
      description: 'Frontend chaos engineering toolkit for testing resilience across Playwright, Cypress, WebdriverIO, and Puppeteer.',
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/chaos-maker-dev/chaos-maker' },
      ],
      editLink: {
        baseUrl: 'https://github.com/chaos-maker-dev/chaos-maker/edit/main/docs/content-source/',
      },
      lastUpdated: true,
      sidebar: [versionsGroup, ...versionAutogenerates],
    }),
  ],
});
