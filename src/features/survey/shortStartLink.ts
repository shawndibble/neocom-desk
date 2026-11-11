/**
 * Turns a Survey start link into a short `/s/<id>` link by asking the
 * `shortStartLink` HTTP function (`functions/src/shortStartLink.ts`) through its
 * Worker at `api.neocomdesk.com/short` (`workers/short-link-proxy`), the same
 * endpoint a script can call. It needs no login. The short link holds the same
 * fields for 60 days and opens the start page with them filled in.
 */
import { appUrl } from '@/features/share/shareStore';

/** The service refused for now: one new short link every 30 seconds, 30 an hour. */
export class ShortLinkLimited extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('short link limit reached');
  }
}

/** The Worker that fronts the function, so no cloudfunctions.net address is shown or called. */
export const SHORT_LINK_ENDPOINT = 'https://api.neocomdesk.com/short';

/** The short link for a start link's path (`/survey?place=…`), on this site's own address. */
export async function makeShortLink(startLinkPath: string): Promise<string> {
  const query = new URL(startLinkPath, 'https://start.invalid').searchParams;
  const response = await fetch(SHORT_LINK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(query)),
  });
  const answer: unknown = await response.json().catch(() => null);
  const id =
    typeof answer === 'object' && answer !== null ? (answer as { id?: unknown }).id : undefined;
  if (response.status === 429) {
    const wait = (answer as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
    throw new ShortLinkLimited(typeof wait === 'number' && wait > 0 ? wait : 30);
  }
  if (!response.ok || typeof id !== 'string') throw new Error('could not make a short link');
  return appUrl(`/s/${id}`);
}
