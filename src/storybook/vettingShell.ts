import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import type { FixtureRoute } from './fixtureFetch';
import { SAMPLE_CHARACTERS } from './sampleData';
import { VETTING_FIXTURE_CORPORATION } from './vettingFixture';

export const vettingShellRoutes = (roles: readonly string[]) => (): FixtureRoute[] => [
  { path: /^\/characters\/\d+\/roles$/, respond: () => ({ body: { roles: [...roles] } }) },
];

export const seedVettingCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((character) =>
      db.characters.update(character.characterId, {
        corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
      })
    )
  );
};

export const VETTING_SHELL_SCOPES: readonly string[] = [
  ...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat()),
];

const ROSTER: readonly { id: number; name: string; title?: string; seenHoursAgo?: number }[] = [
  { id: 2119876543, name: 'Kestrel Vane', title: 'Director', seenHoursAgo: 0 },
  { id: 2119876544, name: 'Orsa Tellemar', title: 'Accountant', seenHoursAgo: 3 },
  { id: 2118000009, name: 'Ren Halvard', title: 'Member', seenHoursAgo: 5 },
  { id: 2118000060, name: 'Dorn Kessel', title: 'Hauler', seenHoursAgo: 30 },
  { id: 2118000004, name: 'Joss Arden', title: 'Member', seenHoursAgo: 52 },
  { id: 2118000008, name: 'Dara Quill', title: 'Miner', seenHoursAgo: 8 },
  { id: 2118000201, name: 'Renna Tavik', title: 'Miner', seenHoursAgo: 26 },
  { id: 2118000202, name: 'Aurelio Brenner', title: 'Hauler', seenHoursAgo: 90 },
  { id: 2118000203, name: 'Maren Holt', seenHoursAgo: 200 },
  { id: 2118000204, name: 'Tobin Rask', title: 'Member' },
];

export const vettingRosterRoutes = (): FixtureRoute[] => {
  const corp = String.raw`^/corporations/\d+`;
  const now = Date.now();
  const titleIds = new Map(
    [...new Set(ROSTER.flatMap((m) => (m.title ? [m.title] : [])))].map((n, i) => [n, i + 1])
  );
  return [
    { path: new RegExp(`${corp}/members$`), respond: () => ({ body: ROSTER.map((m) => m.id) }) },
    {
      path: new RegExp(`${corp}/titles$`),
      respond: () => ({
        body: [...titleIds].map(([name, id]) => ({ title_id: id, name })),
      }),
    },
    {
      path: new RegExp(`${corp}/members/titles$`),
      respond: () => ({
        body: ROSTER.map((m) => ({
          character_id: m.id,
          titles: m.title ? [titleIds.get(m.title)] : [],
        })),
      }),
    },
    {
      path: new RegExp(`${corp}/membertracking$`),
      respond: () => ({
        body: ROSTER.filter((m) => m.seenHoursAgo !== undefined).map((m) => ({
          character_id: m.id,
          logoff_date: new Date(now - (m.seenHoursAgo ?? 0) * 3_600_000).toISOString(),
        })),
      }),
    },
    {
      method: 'POST',
      path: '/universe/names',
      respond: ({ body }) => ({
        body: (body as number[]).flatMap((id) => {
          const m = ROSTER.find((r) => r.id === id);
          return m ? [{ id, name: m.name, category: 'character' }] : [];
        }),
      }),
    },
  ];
};
