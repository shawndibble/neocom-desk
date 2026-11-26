import { appUrl } from '@/features/share/shareStore';

export class ShortLinkLimited extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('short link limit reached');
  }
}

export const SHORT_LINK_ENDPOINT = 'https://api.neocomdesk.com/short';

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
