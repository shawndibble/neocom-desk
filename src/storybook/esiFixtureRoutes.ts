import type { FixtureRoute } from './fixtureFetch';
import {
  SAMPLE_CORPORATION_NAMES,
  SAMPLE_LOYALTY_POINTS,
  SAMPLE_WALLET_BALANCE,
  sampleWalletJournal,
} from './sampleData';

/**
 * ESI answers for the signed-in Character's wallet pages, built from
 * `sampleData`. A page story that reads another endpoint adds its route here
 * (or passes `routes` to the shell decorator): until it does, the request is
 * recorded as unexpected and `src/test/storySmoke.tsx` fails.
 */
export function walletFixtureRoutes(): FixtureRoute[] {
  // Every sample Character answers alike: the net worth view reads the whole roster.
  const own = String.raw`^/characters/\d+`;
  const at = (tail: string) => new RegExp(`${own}${tail}$`);
  return [
    { path: at('/wallet'), respond: () => ({ body: SAMPLE_WALLET_BALANCE }) },
    {
      path: at('/wallet/journal'),
      respond: () => ({ body: sampleWalletJournal(), headers: { 'X-Pages': '1' } }),
    },
    { path: at('/wallet/transactions'), respond: () => ({ body: [] }) },
    { path: at('/loyalty/points'), respond: () => ({ body: SAMPLE_LOYALTY_POINTS }) },
    // Public corporation info: the LP-store prefetch and corp-name lookups ask for any corporation,
    // and a late one from an earlier story must not land as an unfixtured request.
    {
      path: /^\/corporations\/\d+$/,
      respond: ({ url }) => {
        const id = Number(url.pathname.split('/').pop());
        return { body: { name: SAMPLE_CORPORATION_NAMES[id] ?? `Unknown ${id}`, member_count: 1 } };
      },
    },
    {
      method: 'POST',
      path: '/universe/names',
      respond: ({ body }) => ({
        body: (body as number[]).map((id) => ({
          id,
          name: SAMPLE_CORPORATION_NAMES[id] ?? `Unknown ${id}`,
          category: 'corporation',
        })),
      }),
    },
  ];
}
