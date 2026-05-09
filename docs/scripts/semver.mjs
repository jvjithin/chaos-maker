/**
 * Shared semver helpers for the docs versioning pipeline.
 *
 *   - `build-versioned-docs.mjs` parses release tags (`v0.4.0`, `v0.5.0-rc.1`).
 *   - `astro.config.mjs` parses the slug-form directories the script lays down
 *     (`v0-4-0`, `v0-5-0-rc-1`).
 *
 * Both consumers need identical sort and prerelease semantics, so the parsing
 * is centralised here.
 */

// Prerelease is restricted to dot-separated alphanumeric identifiers. Hyphens
// inside an identifier would alias against the `.`→`-` slug encoding (e.g.
// `v1.0.0-alpha-beta` and `v1.0.0-alpha.beta` would both produce slug
// `v1-0-0-alpha-beta`), so we reject them at parse time and at slug emission.
const PRERELEASE_RE = '[A-Za-z0-9]+(?:\\.[A-Za-z0-9]+)*';
const PRERELEASE_SLUG_RE = '[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*';
const TAG_RE = new RegExp(`^v(\\d+)\\.(\\d+)\\.(\\d+)(?:-(${PRERELEASE_RE}))?$`);
const SLUG_RE = new RegExp(`^v(\\d+)-(\\d+)-(\\d+)(?:-(${PRERELEASE_SLUG_RE}))?$`);

export function parseTag(tag) {
  const m = TAG_RE.exec(tag);
  if (!m) return null;
  const [, major, minor, patch, prerelease] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ?? '',
  };
}

export function parseSlug(slug) {
  const m = SLUG_RE.exec(slug);
  if (!m) return null;
  const [, major, minor, patch, prerelease] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    // Slug form replaces every `.` with `-`, so `rc.1` is laid down as
    // `rc-1`. Reverse that here so prerelease comparison matches the tag form.
    prerelease: prerelease ? prerelease.replace(/-/g, '.') : '',
  };
}

export function isStable(parsed) {
  return parsed !== null && parsed.prerelease === '';
}

// Standard semver precedence: prerelease < release; identifier-by-identifier
// comparison; numeric identifiers compare numerically; strings lexicographically.
export function compareParsed(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === '') return 1;
  if (b.prerelease === '') return -1;
  const aParts = a.prerelease.split('.');
  const bParts = b.prerelease.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i];
    const bp = bParts[i];
    if (ap === undefined) return -1;
    if (bp === undefined) return 1;
    const aNum = /^\d+$/.test(ap);
    const bNum = /^\d+$/.test(bp);
    if (aNum && bNum) {
      const diff = Number(ap) - Number(bp);
      if (diff !== 0) return diff;
      continue;
    }
    if (aNum) return -1;
    if (bNum) return 1;
    if (ap !== bp) return ap < bp ? -1 : 1;
  }
  return 0;
}

export function compareTag(a, b) {
  const pa = parseTag(a);
  const pb = parseTag(b);
  if (!pa || !pb) return 0;
  return compareParsed(pa, pb);
}

export function compareSlug(a, b) {
  const pa = parseSlug(a);
  const pb = parseSlug(b);
  if (!pa || !pb) return 0;
  return compareParsed(pa, pb);
}

export function slugToLabel(slug) {
  const p = parseSlug(slug);
  if (!p) return slug;
  const base = `v${p.major}.${p.minor}.${p.patch}`;
  return p.prerelease ? `${base}-${p.prerelease}` : base;
}
