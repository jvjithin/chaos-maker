#!/usr/bin/env node
/**
 * Generate versioned docs into docs/src/content/docs/ from git tags.
 *
 *   - For every `v*.*.*` tag, extract that tag's docs source into
 *     `<repo>/docs/src/content/docs/<slug>/` (slug = tag with dots → dashes,
 *     e.g. `v0.4.0` → `v0-4-0`).
 *   - The newest tag also lands at `docs/src/content/docs/latest/`. `/latest/`
 *     is therefore the public default and tracks released npm versions.
 *   - With `--dev`, the working-tree contents of `docs/content-source/` are
 *     additionally laid down at `docs/src/content/docs/main/` so contributors
 *     can preview unreleased docs locally. CI builds never pass `--dev`, so
 *     `main/` never reaches production.
 *   - Writes a top-level `index.mdx` that redirects `/` → `/latest/`.
 *
 * Tag content is sourced from one of:
 *   - `docs/content-source/`     (post-v0.5.0 layout)
 *   - `docs/src/content/docs/`   (pre-v0.5.0 layout)
 * The script auto-picks whichever path the tagged commit actually contains.
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const DOCS_OUT = resolve(__dirname, '../src/content/docs');
const DEV_SOURCE = resolve(__dirname, '../content-source');
const PAGES_BASE = '/chaos-maker';

const HISTORICAL_SOURCE_PATHS = [
  'docs/content-source',
  'docs/src/content/docs',
];

// Top-level docs sections. Any `/chaos-maker/<section>/...` or `/<section>/...`
// link inside an extracted snapshot must be rewritten to live under the
// snapshot's own version slug, otherwise an archived page would jump out of
// its own version namespace into latest.
const KNOWN_SECTIONS = [
  'adapters',
  'api',
  'concepts',
  'getting-started',
  'rationale',
  'recipes',
];

const isDev = process.argv.includes('--dev');

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function listVersionTags() {
  const out = git(['tag', '-l', 'v*.*.*']);
  if (!out) return [];
  return out
    .split('\n')
    .filter((t) => /^v\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(t));
}

function semverKey(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/.exec(tag);
  if (!m) return [0, 0, 0, ''];
  const [, ma, mi, pa, pre] = m;
  return [Number(ma), Number(mi), Number(pa), pre ?? '~'];
}

function compareSemver(a, b) {
  const A = semverKey(a);
  const B = semverKey(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] !== B[i]) return A[i] - B[i];
  }
  if (A[3] === B[3]) return 0;
  if (A[3] === '~') return 1;
  if (B[3] === '~') return -1;
  return A[3] < B[3] ? -1 : 1;
}

function tagHasPath(tag, path) {
  try {
    const out = git(['ls-tree', '--name-only', tag, '--', path]);
    return out.length > 0;
  } catch {
    return false;
  }
}

function extractTagToDir(tag, destDir) {
  for (const sourcePath of HISTORICAL_SOURCE_PATHS) {
    if (!tagHasPath(tag, sourcePath)) continue;
    const tmp = mkdtempSync(join(tmpdir(), `chaos-docs-${tag}-`));
    try {
      const archive = execFileSync(
        'git',
        ['archive', '--format=tar', tag, '--', sourcePath],
        { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024 },
      );
      execFileSync('tar', ['-xf', '-', '-C', tmp], { input: archive });
      const extracted = join(tmp, sourcePath);
      if (!existsSync(extracted)) {
        throw new Error(`expected ${sourcePath} inside archive for ${tag}`);
      }
      mkdirSync(dirname(destDir), { recursive: true });
      cpSync(extracted, destDir, { recursive: true });
      return true;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return false;
}

function rewriteVersionLinks(dir, slug) {
  const sectionsAlt = KNOWN_SECTIONS.join('|');
  // Capture the syntactic prefix that introduces a URL — markdown link target,
  // jsx href / to attribute, or yaml `link:` value (quoted or bare) — so the
  // rewrite only fires on actual link positions and not on prose that happens
  // to mention a path. The `(?:/chaos-maker)?` group makes the rewrite
  // idempotent against both prefixed and base-relative source authors.
  const re = new RegExp(
    `(\\]\\(|href="|href='|to="|to='|link:\\s*"|link:\\s*'|link:\\s+)(/chaos-maker)?/(${sectionsAlt})/`,
    'g',
  );
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!entry.endsWith('.mdx') && !entry.endsWith('.md')) continue;
      const text = readFileSync(p, 'utf8');
      const next = text.replace(re, (_m, prefix, _base, section) =>
        `${prefix}${PAGES_BASE}/${slug}/${section}/`,
      );
      if (next !== text) writeFileSync(p, next);
    }
  };
  walk(dir);
}

function injectBanner(dir, bannerContent) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      injectBanner(p, bannerContent);
      continue;
    }
    if (!entry.endsWith('.mdx') && !entry.endsWith('.md')) continue;
    const text = readFileSync(p, 'utf8');
    const lines = text.split('\n');
    if (lines[0] !== '---') continue;
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') { end = i; break; }
    }
    if (end < 0) continue;
    const next = [
      ...lines.slice(0, end),
      'banner:',
      `  content: '${bannerContent.replace(/'/g, "\\'")}'`,
      ...lines.slice(end),
    ];
    writeFileSync(p, next.join('\n'));
  }
}

function tagToSlug(tag) {
  return tag.replace(/\./g, '-');
}

function writeRedirectIndex(latestTag) {
  const target = `${PAGES_BASE}/latest/`;
  const body = `---
title: Chaos Maker
description: Frontend chaos engineering toolkit for testing resilience across Playwright, Cypress, WebdriverIO, and Puppeteer.
template: splash
hero:
  tagline: Latest stable release is ${latestTag}.
  actions:
    - text: Open ${latestTag} docs
      link: ${target}
      icon: right-arrow
      variant: primary
head:
  - tag: meta
    attrs:
      http-equiv: refresh
      content: 0; url=${target}
  - tag: link
    attrs:
      rel: canonical
      href: ${target}
---

import { LinkCard } from '@astrojs/starlight/components';

This is the redirect landing for the Chaos Maker docs. Versioned docs are published from git tags and the latest stable release is **${latestTag}**.

<LinkCard title="Open ${latestTag} docs" href="${target}" />
`;
  writeFileSync(join(DOCS_OUT, 'index.mdx'), body);
}

function clean() {
  if (!existsSync(DOCS_OUT)) {
    mkdirSync(DOCS_OUT, { recursive: true });
    return;
  }
  for (const entry of readdirSync(DOCS_OUT)) {
    if (entry === '.gitkeep') continue;
    rmSync(join(DOCS_OUT, entry), { recursive: true, force: true });
  }
}

function main() {
  const tags = listVersionTags().sort(compareSemver);
  if (tags.length === 0) {
    throw new Error(
      '[docs-versions] no v*.*.* tags found — fetch tags before building',
    );
  }
  const latestTag = tags[tags.length - 1];

  console.log(`[docs-versions] tags=[${tags.join(', ')}] latest=${latestTag}`);

  clean();

  for (const tag of tags) {
    const slug = tagToSlug(tag);
    const dest = join(DOCS_OUT, slug);
    if (!extractTagToDir(tag, dest)) {
      console.warn(`[docs-versions] ${tag} has no docs source; skipping`);
      continue;
    }
    const isLatest = tag === latestTag;
    const banner = isLatest
      ? `Latest stable: <strong>${tag}</strong>.`
      : `Archived <strong>${tag}</strong> docs. <a href="${PAGES_BASE}/latest/">Latest</a>.`;
    rewriteVersionLinks(dest, slug);
    injectBanner(dest, banner);
    console.log(`[docs-versions]   ${tag} → ${slug}/`);
  }

  const latestDest = join(DOCS_OUT, 'latest');
  if (!extractTagToDir(latestTag, latestDest)) {
    throw new Error(
      `[docs-versions] failed to extract latest tag ${latestTag}`,
    );
  }
  rewriteVersionLinks(latestDest, 'latest');
  injectBanner(
    latestDest,
    `Latest stable: <strong>${latestTag}</strong>.`,
  );
  console.log(`[docs-versions]   ${latestTag} → latest/`);

  if (isDev) {
    if (existsSync(DEV_SOURCE)) {
      const mainDest = join(DOCS_OUT, 'main');
      cpSync(DEV_SOURCE, mainDest, { recursive: true });
      rewriteVersionLinks(mainDest, 'main');
      injectBanner(
        mainDest,
        `Unreleased <strong>main</strong> preview. <a href="${PAGES_BASE}/latest/">View latest</a>.`,
      );
      console.log('[docs-versions]   docs/content-source/ → main/ (dev)');
    } else {
      console.warn(
        '[docs-versions] --dev given but docs/content-source/ missing',
      );
    }
  }

  writeRedirectIndex(latestTag);
  console.log('[docs-versions] index.mdx → redirects to /latest/');
}

main();
