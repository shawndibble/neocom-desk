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

/** The community Discord: questions, feedback, and chatting with other pilots. */
export const DISCORD_URL = 'https://discord.gg/Jr7WRMCBPE';

/** CCP's page where a signed-in player views and revokes the third-party apps they've authorized. */
export const AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';
