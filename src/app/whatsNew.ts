export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

/**
 * Which changelog entries are new since `lastSeenVersion`, newest first.
 *
 * `null` means no version has ever been recorded — a fresh install, which
 * gets nothing rather than the whole history (there is no "before" for a
 * brand-new user to compare against). An unrecognized version (pruned from
 * the changelog, or predating this feature) falls back to just the current
 * entry, so a long-lived install without ever having a `lastSeenVersion`
 * still gets *something* to look at without a wall of old entries.
 */
export function selectUnseenEntries(
  changelog: ChangelogEntry[],
  lastSeenVersion: string | null,
  currentVersion: string
): ChangelogEntry[] {
  if (lastSeenVersion === null || lastSeenVersion === currentVersion) return [];

  const seenIndex = changelog.findIndex((entry) => entry.version === lastSeenVersion);
  if (seenIndex === -1) {
    const current = changelog.find((entry) => entry.version === currentVersion);
    return current ? [current] : [];
  }

  return changelog.slice(0, seenIndex);
}
