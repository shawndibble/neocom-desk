import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import { SAMPLE_CHARACTERS, SAMPLE_CORPORATION_NAMES } from '@/storybook/sampleData';

/**
 * Sample data for the issue #4777 mockup: contacts, their affiliations and
 * public records, with the `achievement_score` / `character_title_id` fields
 * compat date 2026-06-09 added. Title names are real `characterTitles.jsonl`
 * entries from CCP's static data export.
 */

export interface SampleTitle {
  id: string;
  name: string;
}

export const TITLES = {
  selenologist: { id: '0c231769-621e-53d5-bd49-ce07a7b4a544', name: 'Selenologist' },
  cartographer: { id: '15ebcdeb-329a-54d5-8e31-eba467ed874b', name: 'Federal Cartographer' },
  battlecruiserSmith: { id: '00851de7-b7ca-5136-871e-d07429563c06', name: 'Battlecruiser Smith' },
  starkman: { id: '04ae6e1f-d39a-5f5b-b9f4-7a2b3e426a38', name: 'Starkman Champion' },
} satisfies Record<string, SampleTitle>;

export interface SampleContactPilot {
  id: number;
  name: string;
  corporationId: number;
  allianceId?: number;
  standing: number;
  watched?: boolean;
  blocked?: boolean;
  score: number;
  title?: SampleTitle;
}

const CORPS: Record<number, string> = {
  ...SAMPLE_CORPORATION_NAMES,
  98765432: 'Brass Meridian Logistics',
  98100001: 'Halcyon Drift Mining',
  98100002: 'Red Lantern Syndicate',
  98100003: 'Quiet Orbit Research',
};
const ALLIANCES: Record<number, string> = {
  99100001: 'Coalition of the Lit Gate',
  99100002: 'Ashen Verge',
};

export const CONTACT_PILOTS: readonly SampleContactPilot[] = [
  {
    id: 2120000001,
    name: 'Mira Calloway',
    corporationId: 98100001,
    allianceId: 99100001,
    standing: 10,
    watched: true,
    score: 1240,
    title: TITLES.selenologist,
  },
  {
    id: 2120000002,
    name: 'Tavish Orrin',
    corporationId: 98100003,
    standing: 5,
    score: 385,
    title: TITLES.cartographer,
  },
  {
    id: 2120000003,
    name: 'Jun Hesketh',
    corporationId: 98765432,
    standing: 10,
    score: 140,
  },
  {
    id: 2120000004,
    name: 'Dray Volkonen',
    corporationId: 98100002,
    allianceId: 99100002,
    standing: -10,
    blocked: true,
    score: 2015,
    title: TITLES.starkman,
  },
  // A score of 0 and no title: nothing new shows.
  { id: 2120000005, name: 'Pell Ashgrove', corporationId: 98100002, standing: -5, score: 0 },
  {
    id: 2120000006,
    name: 'Corin Vasquez-Hale',
    corporationId: 98100001,
    allianceId: 99100001,
    standing: 0,
    score: 85,
    title: TITLES.battlecruiserSmith,
  },
];

const NON_PILOT_CONTACTS = [
  { contact_id: 98100002, contact_type: 'corporation' as const, standing: -10 },
  { contact_id: 99100001, contact_type: 'alliance' as const, standing: 10 },
];

/** The signed-in roster: the first Character has both, the second neither (so shows nothing new). */
export const OWN_PILOTS: Readonly<Record<number, { score: number; title?: SampleTitle }>> = {
  [SAMPLE_CHARACTERS[0].characterId]: { score: 2315, title: TITLES.cartographer },
  [SAMPLE_CHARACTERS[1].characterId]: { score: 0 },
};

/** The modal's sample pilot: score and title both set. */
export const LOOKUP_PILOT = CONTACT_PILOTS[0];
/** The modal's no-score pilot. */
export const LOOKUP_PILOT_EMPTY = CONTACT_PILOTS[4];

const NAMES: Record<number, { name: string; category: string }> = Object.fromEntries([
  ...CONTACT_PILOTS.map((p) => [p.id, { name: p.name, category: 'character' }]),
  ...SAMPLE_CHARACTERS.map((c) => [c.characterId, { name: c.name, category: 'character' }]),
  ...Object.entries(CORPS).map(([id, name]) => [Number(id), { name, category: 'corporation' }]),
  ...Object.entries(ALLIANCES).map(([id, name]) => [Number(id), { name, category: 'alliance' }]),
]);

function publicCharacter(id: number) {
  const pilot = CONTACT_PILOTS.find((p) => p.id === id);
  const own = SAMPLE_CHARACTERS.find((c) => c.characterId === id);
  const title = pilot?.title ?? OWN_PILOTS[id]?.title;
  return {
    name: pilot?.name ?? own?.name ?? `Pilot ${id}`,
    corporation_id: pilot?.corporationId ?? own?.corporationId ?? 98765432,
    ...(pilot?.allianceId ? { alliance_id: pilot.allianceId } : {}),
    birthday: '2014-03-11T09:12:00Z',
    bloodline_id: 1,
    gender: 'female',
    race_id: 1,
    security_status: 1.8,
    description: '',
    achievement_score: pilot?.score ?? OWN_PILOTS[id]?.score ?? 0,
    ...(title ? { character_title_id: title.id } : {}),
  };
}

const ESI_NAMES: FixtureRoute = {
  method: 'POST',
  path: '/universe/names',
  respond: ({ body }) => ({
    body: (body as number[]).map((id) => ({
      id,
      name: NAMES[id]?.name ?? `Unknown ${id}`,
      category: NAMES[id]?.category ?? 'corporation',
    })),
  }),
};

/** Contacts page, the public info modal and the Characters page, all from one table. */
export function scoreTitleFixtureRoutes(): FixtureRoute[] {
  const own = String.raw`^/characters/\d+`;
  const at = (tail: string) => new RegExp(`${own}${tail}$`);
  return [
    ...walletFixtureRoutes().filter((r) => r.path !== '/universe/names'),
    ESI_NAMES,
    {
      path: at('/contacts'),
      respond: () => ({
        body: [
          ...CONTACT_PILOTS.map((p) => ({
            contact_id: p.id,
            contact_type: 'character',
            standing: p.standing,
            ...(p.watched ? { is_watched: true } : {}),
            ...(p.blocked ? { is_blocked: true } : {}),
          })),
          ...NON_PILOT_CONTACTS,
        ],
        headers: { 'X-Pages': '1' },
      }),
    },
    { path: at('/contacts/labels'), respond: () => ({ body: [] }) },
    {
      method: 'POST',
      path: '/characters/affiliation',
      respond: ({ body }) => ({
        body: (body as number[]).map((id) => {
          const pilot = CONTACT_PILOTS.find((p) => p.id === id);
          const own = SAMPLE_CHARACTERS.find((c) => c.characterId === id);
          return {
            character_id: id,
            corporation_id: pilot?.corporationId ?? own?.corporationId ?? 98765432,
            ...(pilot?.allianceId ? { alliance_id: pilot.allianceId } : {}),
          };
        }),
      }),
    },
    // zKillboard (Show info's Character tab) and price feeds (the Characters page): quiet, empty.
    { path: /^\/api\/(kills|losses)\/characterID\/\d+\/$/, respond: () => ({ body: [] }) },
    { path: /^\/api\/stats\/characterID\/\d+\/$/, respond: () => ({ body: {} }) },
    { path: /^\/open-prices\/\d+\.json$/, respond: () => ({ body: {} }) },
    {
      path: /^\/markets\/\d+\/orders$/,
      respond: () => ({ body: [], headers: { 'X-Pages': '1' } }),
    },
    { path: '/aggregates/', respond: () => ({ body: {} }) },
    {
      path: /^\/characters\/\d+$/,
      respond: ({ url }) => ({ body: publicCharacter(Number(url.pathname.split('/')[2])) }),
    },
    {
      path: /^\/corporations\/\d+$/,
      respond: ({ url }) => {
        const id = Number(url.pathname.split('/')[2]);
        return {
          body: {
            name: CORPS[id] ?? `Corp ${id}`,
            ticker: 'SMPL',
            member_count: 42,
            ceo_id: CONTACT_PILOTS[0].id,
            creator_id: CONTACT_PILOTS[0].id,
            tax_rate: 0.1,
            date_founded: '2015-01-01T00:00:00Z',
            ...(id === 98100001 ? { alliance_id: 99100001 } : {}),
          },
        };
      },
    },
    {
      path: /^\/alliances\/\d+$/,
      respond: ({ url }) => {
        const id = Number(url.pathname.split('/')[2]);
        return {
          body: {
            name: ALLIANCES[id] ?? `Alliance ${id}`,
            ticker: 'LIT',
            creator_id: CONTACT_PILOTS[0].id,
            creator_corporation_id: 98100001,
            executor_corporation_id: 98100001,
            date_founded: '2016-01-01T00:00:00Z',
          },
        };
      },
    },
  ];
}

export const CONTACTS_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_loyalty.v1',
  'esi-characters.read_contacts.v1',
];

/** Hides the shell's broker-fee standings notice, which is not what these shots are about. */
export async function seedScoreTitle(): Promise<void> {
  for (const { characterId } of SAMPLE_CHARACTERS) {
    try {
      localStorage.setItem(`standingsScopeNoticeDismissed:${characterId}`, '1');
    } catch {
      // Blocked storage: the notice shows, nothing else changes.
    }
  }
}
