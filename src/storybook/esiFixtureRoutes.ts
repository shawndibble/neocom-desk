import type { FixtureRoute } from './fixtureFetch';
import {
  SAMPLE_CORPORATION_NAMES,
  SAMPLE_LOYALTY_POINTS,
  SAMPLE_WALLET_BALANCE,
  sampleWalletJournal,
} from './sampleData';

export function walletFixtureRoutes(): FixtureRoute[] {
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
