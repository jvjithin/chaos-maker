import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import { compareSlug, parseSlug, slugToLabel } from './scripts/semver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, 'src/content/docs');

const skipAutoSitemap = {
  name: '@astrojs/sitemap',
  hooks: {},
};

// Discover the version directories laid down by scripts/build-versioned-docs.mjs.
// Slugs look like `v0-4-0` or `v0-5-0-rc-1`; the optional `main` directory is
// the unreleased preview written only when the script is run with `--dev`.
function discoverVersions() {
  let entries;
  try {
    entries = readdirSync(DOCS_ROOT, { withFileTypes: true });
  } catch {
    return { versionDirs: [], hasMain: false };
  }
  const versionDirs = entries
    .filter((e) => e.isDirectory() && parseSlug(e.name) !== null)
    .map((e) => e.name)
    .sort(compareSlug)
    .reverse();
  const hasMain = entries.some((e) => e.isDirectory() && e.name === 'main');
  return { versionDirs, hasMain };
}

const { versionDirs, hasMain } = discoverVersions();

const versionsGroup = {
  label: 'Versions',
  items: [
    { label: 'Latest', link: '/latest/' },
    ...versionDirs.map((slug) => ({
      label: slugToLabel(slug),
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
    label: `${slugToLabel(slug)} archive`,
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
      // Per-page `editUrl` is injected by scripts/build-versioned-docs.mjs:
      // archived versions get `editUrl: false`, latest/main get an explicit
      // URL pointing at `docs/content-source/<original-relative-path>`. A
      // single `editLink.baseUrl` here cannot strip the leading version
      // segment, so it would produce broken paths like
      // `docs/content-source/latest/...`.
      lastUpdated: true,
      sidebar: [versionsGroup, ...versionAutogenerates],
    }),
  ],
});
