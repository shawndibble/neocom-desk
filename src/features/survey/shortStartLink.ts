/**
 * Turns a Survey start link into a short `/s/<id>` link by asking the
 * `shortStartLink` HTTP function (`functions/src/shortStartLink.ts`), the same
 * endpoint a script can call. It needs no login. The short link holds the same
 * fields for 30 days and opens the start page with them filled in.
 */
import { appUrl } from '@/features/share/shareStore';

/** Functions run in the default region of the shared Firebase project. */
export function shortStartLinkEndpoint(): string | null {
  const project = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return project ? `https://us-central1-${project}.cloudfunctions.net/shortStartLink` : null;
}

/** The short link for a start link's path (`/survey?place=…`), on this site's own address. */
export async function makeShortLink(startLinkPath: string): Promise<string> {
  const endpoint = shortStartLinkEndpoint();
  if (endpoint === null) throw new Error('no short link service configured');
  const query = new URL(startLinkPath, 'https://start.invalid').searchParams;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(query)),
  });
  const answer: unknown = await response.json().catch(() => null);
  const id =
    typeof answer === 'object' && answer !== null ? (answer as { id?: unknown }).id : undefined;
  if (!response.ok || typeof id !== 'string') throw new Error('could not make a short link');
  return appUrl(`/s/${id}`);
}
