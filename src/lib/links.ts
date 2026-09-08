/**
 * Outbound links to the project itself.
 *
 * One definition, because two would drift: the landing page's footer and
 * Settings' FAQ both point at the repo, and a stale URL in either is a dead
 * end for someone trying to report something.
 */
export const REPO_URL = 'https://github.com/shawndibble/neocom-desk';

/** Where a bug report or a feature request goes. */
export const ISSUES_URL = `${REPO_URL}/issues`;
