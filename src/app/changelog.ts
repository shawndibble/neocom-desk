import type { ChangelogEntry } from './whatsNew';

/**
 * Bundled release notes for the "what's new" panel — never fetched, so the
 * panel works offline and the app takes on no dependency on GitHub Releases.
 * Newest first. Append one entry per release; do not edit past ones.
 */
export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-08-31',
    items: ['What’s new after an update: this panel.'],
  },
];
