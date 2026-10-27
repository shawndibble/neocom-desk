/**
 * How Neocom Desk names itself to every third-party API it calls (ESI's
 * `X-User-Agent`, EVE Workbench). Its own module so a non-ESI fetch can send
 * it without pulling in the ESI client. Never a personal email.
 */
export const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';
