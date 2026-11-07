/**
 * Outbound links to the project itself.
 *
 * One definition, because two would drift: the landing page's footer and
 * Settings' Help & Support both point at these, and a stale URL in either is
 * a dead end for someone trying to reach the community or the source.
 */
export const REPO_URL = 'https://github.com/shawndibble/neocom-desk';

/**
 * Where a bug report, feature request, or any other discussion goes.
 * GitHub is for reading the source or a pull request, not for filing
 * anything — see `REPO_URL`.
 */
export const DISCORD_URL = 'https://discord.gg/Jr7WRMCBPE';

/** CCP's page where a signed-in player views and revokes the third-party apps they've authorized. */
export const AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';

/** EVE University's entry page for new players: the game's core ideas, with links onward. */
export const EVE_UNI_NEW_PLAYER_URL = 'https://wiki.eveuniversity.org/New_Player_Index';

/** EVE University's overview of the ways to earn ISK, by skill and capital needed. */
export const EVE_UNI_MAKING_MONEY_URL = 'https://wiki.eveuniversity.org/Making_Money';

/** EVE University's lexicon of EVE's jargon, beyond the few words the FAQ defines. */
export const EVE_UNI_LEXICON_URL = 'https://wiki.eveuniversity.org/EVE_Lexicon';

/** CCP's support site: account, billing and in-game problems Neocom Desk cannot help with. */
export const CCP_SUPPORT_URL = 'https://support.eveonline.com/hc/en-us';
