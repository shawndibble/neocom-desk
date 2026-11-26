/**
 * D6 (Intel) invented pilots, corporations and alliances, plus the public ESI and zKillboard
 * answers for them. Names are made up to read like EVE names; none is a real pilot or corp.
 * Own file for the D6 capture: nothing here is shared with the other deepdive captures.
 */
import type { Page, Route } from '@playwright/test';
import { ARDEN } from '../cast';

const DAY = 86_400_000;

export interface D6Alliance {
  id: number;
  name: string;
  ticker: string;
}
export interface D6Corp {
  id: number;
  name: string;
  ticker: string;
  allianceId: number | null;
}
export interface D6Pilot {
  id: number;
  name: string;
  corpId: number;
  /** Months old, for the birthday on the Character tab. */
  ageMonths: number;
  security: number;
  /** Kills in the last 30 days (zKillboard history); 0 means no kills. */
  kills30d?: number;
  /** All-time shape for the stats call. */
  stats?: { kills: number; losses: number; solo: number; danger: number; gang: number };
  /** Hull type ids the pilot flies (zKillboard attackers). */
  hulls?: number[];
  /** Previous corporations, newest first, with how long ago each stint started (days). */
  history?: { corpId: number; startedDaysAgo: number }[];
}

export const ALLIANCES: D6Alliance[] = [
  { id: 99_011_204, name: 'Ashen Meridian Pact', ticker: 'AMP' },
  { id: 99_007_861, name: 'Redline Vanguard Coalition', ticker: 'RVC' },
  { id: 99_013_330, name: 'Pale Harbor Accord', ticker: 'PHA' },
];

export const CORPS: D6Corp[] = [
  { id: 98_702_114, name: 'Vanta Ledger Syndicate', ticker: 'VANTA', allianceId: 99_011_204 },
  { id: 98_702_377, name: 'Ironhold Salvage Cooperative', ticker: 'IHSC', allianceId: 99_011_204 },
  { id: 98_688_052, name: 'Kestrel Reach Expeditionary', ticker: 'KRX', allianceId: 99_007_861 },
  { id: 98_688_940, name: 'Dusk Harrow Limited', ticker: 'DHL', allianceId: 99_007_861 },
  { id: 98_711_603, name: 'Obsidian Tithe', ticker: 'OBTI', allianceId: 99_013_330 },
  { id: 98_719_288, name: 'Lowmarch Freight Union', ticker: 'LMFU', allianceId: null },
  { id: 98_695_731, name: 'Cinder Gate Collective', ticker: 'CGC', allianceId: null },
];

const c = (name: string) => CORPS.find((x) => x.name.startsWith(name))!.id;

// Hull type ids (real SDE types): Sabre 22456, Loki 29990, Hurricane 24702, Muninn 12015,
// Ferox 16227, Vexor Navy Issue 17843, Stiletto 11196, Cerberus 11993, Caracal 621.
export const PILOTS: D6Pilot[] = [
  {
    id: 2_119_440_117, name: 'Corvane Ashdell', corpId: c('Vanta'), ageMonths: 61, security: -4.8,
    kills30d: 46, stats: { kills: 1_284, losses: 211, solo: 164, danger: 86, gang: 71 },
    hulls: [22456, 29990, 11993],
    history: [
      { corpId: c('Cinder'), startedDaysAgo: 1_460 },
      { corpId: c('Ironhold'), startedDaysAgo: 920 },
    ],
  },
  {
    id: 2_118_902_650, name: 'Isolde Venhart', corpId: c('Kestrel'), ageMonths: 38, security: -2.1,
    kills30d: 14, stats: { kills: 392, losses: 98, solo: 31, danger: 74, gang: 82 },
    hulls: [24702, 12015, 16227],
    history: [{ corpId: c('Lowmarch'), startedDaysAgo: 640 }],
  },
  { id: 2_117_310_448, name: 'Teodric Malvane', corpId: c('Vanta'), ageMonths: 26, security: 0.3 },
  { id: 2_116_882_091, name: 'Rennick Soulfeather', corpId: c('Vanta'), ageMonths: 19, security: 1.2 },
  { id: 2_120_014_362, name: 'Halvard Ostrelle', corpId: c('Vanta'), ageMonths: 8, security: 0 },
  { id: 2_115_667_905, name: 'Mirelle Dacosta', corpId: c('Ironhold'), ageMonths: 44, security: 2.4 },
  { id: 2_114_208_733, name: 'Quillon Tarvash', corpId: c('Ironhold'), ageMonths: 15, security: -0.6 },
  { id: 2_119_125_586, name: 'Saphira Lundqvist', corpId: c('Ironhold'), ageMonths: 5, security: 0 },
  { id: 2_113_540_219, name: 'Brannoch Velk', corpId: c('Kestrel'), ageMonths: 72, security: -1.4 },
  { id: 2_116_031_874, name: 'Ysolde Karmakar', corpId: c('Kestrel'), ageMonths: 29, security: 0.9 },
  { id: 2_118_470_302, name: 'Dorian Fenwick-Rao', corpId: c('Kestrel'), ageMonths: 11, security: 0 },
  { id: 2_112_906_117, name: 'Aldous Pereval', corpId: c('Dusk'), ageMonths: 83, security: 3.7 },
  { id: 2_117_759_640, name: 'Katarin Ilvane', corpId: c('Dusk'), ageMonths: 33, security: -0.2 },
  { id: 2_120_288_431, name: 'Soren Blackthorne', corpId: c('Dusk'), ageMonths: 3, security: 0 },
  { id: 2_115_093_272, name: 'Evander Quist', corpId: c('Obsidian'), ageMonths: 57, security: -3.3,
    kills30d: 5, stats: { kills: 143, losses: 60, solo: 9, danger: 58, gang: 90 }, hulls: [17843, 11196] },
  { id: 2_116_605_958, name: 'Liora Nakamura-Voss', corpId: c('Obsidian'), ageMonths: 22, security: 0.4 },
  { id: 2_119_877_024, name: 'Tavish Orlenko', corpId: c('Obsidian'), ageMonths: 9, security: 0 },
  { id: 2_114_731_665, name: 'Perrin Aldecott', corpId: c('Lowmarch'), ageMonths: 48, security: 4.9 },
  { id: 2_117_004_193, name: 'Nadezhda Holm', corpId: c('Lowmarch'), ageMonths: 31, security: 2.2 },
  { id: 2_118_218_876, name: 'Kasimir Duquesne', corpId: c('Lowmarch'), ageMonths: 14, security: 0.5 },
  { id: 2_113_982_340, name: 'Odalys Thornquist', corpId: c('Cinder'), ageMonths: 66, security: 1.6 },
  { id: 2_116_349_811, name: 'Wystan Marlowe-Ibe', corpId: c('Cinder'), ageMonths: 24, security: -0.9 },
  { id: 2_120_105_527, name: 'Fenna Aldrich-Zhou', corpId: c('Cinder'), ageMonths: 6, security: 0 },
  { id: 2_115_886_702, name: 'Garrick Solvane', corpId: c('Cinder'), ageMonths: 41, security: 0.8 },
  { id: 2_117_491_238, name: 'Imrie Castellane', corpId: c('Lowmarch'), ageMonths: 18, security: 1.1 },
  // Arrive only in the second Local.
  { id: 2_118_773_065, name: 'Vorlag Reinhardt', corpId: c('Kestrel'), ageMonths: 52, security: -5.0,
    kills30d: 31, stats: { kills: 842, losses: 133, solo: 97, danger: 82, gang: 64 }, hulls: [22456, 11196] },
  { id: 2_116_240_519, name: 'Anselm Drovik', corpId: c('Vanta'), ageMonths: 12, security: 0 },
  { id: 2_119_550_904, name: 'Calista Wren-Maddox', corpId: c('Dusk'), ageMonths: 27, security: -0.4 },
  { id: 2_114_993_786, name: 'Hadrian Esk', corpId: c('Obsidian'), ageMonths: 7, security: 0 },
];

/** The first Local: the first 25 pilots above. */
export const LOCAL_1 = PILOTS.slice(0, 25).map((p) => p.name);
/** The second Local: three leave (Quillon, Perrin, Odalys), four arrive. */
export const LOCAL_2 = [
  ...PILOTS.slice(0, 25).filter((p) => !['Quillon Tarvash', 'Perrin Aldecott', 'Odalys Thornquist'].includes(p.name)),
  ...PILOTS.slice(25),
].map((p) => p.name);

const FIRST = ['Aurelio', 'Brynja', 'Cassian', 'Delphine', 'Emeric', 'Fiora', 'Gunnar', 'Helene', 'Ignatz', 'Jovana', 'Kellan', 'Lucan', 'Maren', 'Nikolai', 'Oriel', 'Petra', 'Quentin', 'Rosalind', 'Stellan', 'Thea'];
const LAST = ['Varga', 'Holloway', 'Ferreira', 'Okonkwo', 'Lindqvist', 'Moreau', 'Dragan', 'Whitlock', 'Sandoval', 'Eriksen', 'Tanaka-Bell', 'Corrigan'];
/** Invented names for the pilots on killmails (victims and gang mates), stable per id. */
const bystanderName = (id: number) => `${FIRST[id % FIRST.length]} ${LAST[Math.floor(id / 7) % LAST.length]}`;
const isBystander = (id: number) => (id >= 2_100_000_000 && id < 2_100_001_000) || (id >= 2_105_000_000 && id < 2_107_000_000);
const NPC_CORPS = new Map([[1_000_009, 'Caldari Provisions']]);
const pilotById = new Map(PILOTS.map((p) => [p.id, p]));
const pilotByName = new Map(PILOTS.map((p) => [p.name.toLowerCase(), p]));
const corpById = new Map(CORPS.map((x) => [x.id, x]));
const allianceById = new Map(ALLIANCES.map((x) => [x.id, x]));

/** Arden and this pilot have a history (wallet journal), so the Interactions tab has rows. */
export const PARTNER = PILOTS[0]; // Corvane Ashdell, the most dangerous pilot in the first Local

const iso = (ms: number) => new Date(ms).toISOString();

function killList(pilot: D6Pilot, side: 'kills' | 'losses'): unknown[] {
  if (side === 'losses') {
    if (!pilot.stats) return [];
    return Array.from({ length: 6 }, (_, i) => ({
      killmail_id: 120_000_000 + pilot.id % 1000 * 100 + (50 - i),
      killmail_time: iso(Date.now() - (9 + i * 41) * DAY),
      solar_system_id: 30_002_813,
      victim: { character_id: pilot.id, corporation_id: pilot.corpId, ship_type_id: pilot.hulls?.[i % pilot.hulls.length] ?? 22456, items: [] },
      attackers: [{ character_id: 2_100_000_000 + i, final_blow: true, ship_type_id: 24_698 }],
      zkb: { hash: `d6${pilot.id}${i}`.padEnd(40, 'a').slice(0, 40), totalValue: 90_000_000 + i * 6_000_000, labels: ['loc:nullsec', 'pvp'] },
    }));
  }
  const count = pilot.kills30d ?? 0;
  if (count === 0) return [];
  const victimHulls = [626, 621, 24_698, 16_242, 593, 585, 16_240];
  return Array.from({ length: Math.min(200, count + 22) }, (_, i) => ({
    killmail_id: 121_000_000 + pilot.id % 1000 * 500 + (400 - i),
    // The first `count` fall in the last 30 days, the rest older, newest first.
    killmail_time: iso(Date.now() - (i < count ? (i + 0.4) * (28 / count) : 31 + (i - count) * 9) * DAY),
    solar_system_id: i % 3 === 0 ? 30_002_813 : 30_002_809,
    victim: { character_id: 2_105_000_000 + i, ship_type_id: victimHulls[i % victimHulls.length], items: [] },
    attackers: [
      { character_id: pilot.id, corporation_id: pilot.corpId, ship_type_id: (pilot.hulls ?? [22456])[i % (pilot.hulls?.length ?? 1)], final_blow: i % 2 === 0 },
      ...(i % 4 === 0 ? [] : [{ character_id: 2_106_000_000 + i, ship_type_id: 11_993 }]),
    ],
    zkb: { hash: `d6k${pilot.id}${i}`.padEnd(40, 'b').slice(0, 40), totalValue: 18_000_000 + (i % 7) * 9_000_000, labels: [i % 5 === 0 ? 'loc:lowsec' : 'loc:nullsec', 'pvp'] },
  }));
}

function zkillStats(pilot: D6Pilot): unknown {
  if (!pilot.stats) return { error: 'Invalid type or id' };
  const s = pilot.stats;
  return {
    shipsDestroyed: s.kills, shipsLost: s.losses, soloKills: s.solo,
    iskDestroyed: s.kills * 61_000_000, iskLost: s.losses * 47_000_000,
    dangerRatio: s.danger, gangRatio: s.gang,
    topAllTime: [{ type: 'ship', data: (pilot.hulls ?? [22456]).map((id, i) => ({ shipTypeID: id, kills: Math.round(s.kills / (2 + i * 2)) })) }],
    info: { name: pilot.name },
  };
}

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/** Hull prices (ISK) for the scan's worth line: the shared world prices these hulls far too low. */
const HULL_PRICE: Record<number, number> = {
  22456: 46_000_000, 29990: 262_000_000, 12015: 168_000_000, 11978: 57_000_000, 11961: 94_000_000,
  20125: 71_000_000, 24702: 27_000_000, 11985: 88_000_000, 11963: 46_000_000, 11969: 104_000_000,
};

export async function installD6Mocks(page: Page) {
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const url = new URL(route.request().url());
    const types = (url.searchParams.get('types') ?? '').split(',').map(Number).filter(Boolean);
    if (types.length === 0 || !types.every((id) => HULL_PRICE[id] !== undefined)) return route.fallback();
    const side = (price: number, factor: number) => ({
      max: String(price * factor), min: String(price * factor), volume: '1840', orderCount: '62',
      weightedAverage: String(price * factor), median: String(price * factor),
    });
    return json(route, Object.fromEntries(types.map((id) => [String(id), { buy: side(HULL_PRICE[id], 0.94), sell: side(HULL_PRICE[id], 1) }])));
  });

  await page.route('https://zkillboard.com/**', async (route) => {
    const url = new URL(route.request().url());
    const stats = /\/api\/stats\/characterID\/(\d+)\//.exec(url.pathname);
    if (stats) return json(route, zkillStats(pilotById.get(Number(stats[1])) ?? ({} as D6Pilot)));
    const list = /\/api\/(kills|losses)\/characterID\/(\d+)\//.exec(url.pathname);
    if (list) {
      const pilot = pilotById.get(Number(list[2]));
      return json(route, pilot ? killList(pilot, list[1] as 'kills' | 'losses') : []);
    }
    if (url.pathname.startsWith('/autocomplete/')) return json(route, []);
    return json(route, []);
  });

  await page.route('https://esi.evetech.net/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    const method = request.method();
    let body: unknown = null;
    try {
      body = method === 'POST' ? JSON.parse(request.postData() ?? 'null') : null;
    } catch {
      body = null;
    }
    if (path === '/universe/ids' && method === 'POST') {
      const names = (body as string[]) ?? [];
      const characters = names.flatMap((n) => {
        const p = pilotByName.get(n.toLowerCase());
        return p ? [{ id: p.id, name: p.name }] : [];
      });
      if (characters.length === 0) return route.fallback();
      return json(route, { characters });
    }
    if (path === '/characters/affiliation' && method === 'POST') {
      const ids = (body as number[]) ?? [];
      if (!ids.some((id) => pilotById.has(id))) return route.fallback();
      return json(
        route,
        ids.map((id) => {
          const p = pilotById.get(id);
          if (!p) return { character_id: id, corporation_id: 98_000_001 };
          const corp = corpById.get(p.corpId)!;
          return { character_id: id, corporation_id: corp.id, ...(corp.allianceId ? { alliance_id: corp.allianceId } : {}) };
        })
      );
    }
    if (path === '/universe/names' && method === 'POST') {
      const ids = (body as number[]) ?? [];
      if (!ids.some((id) => pilotById.has(id) || corpById.has(id) || allianceById.has(id) || isBystander(id) || NPC_CORPS.has(id))) return route.fallback();
      return json(
        route,
        ids.flatMap((id) => {
          const p = pilotById.get(id);
          if (p) return [{ id, name: p.name, category: 'character' }];
          if (isBystander(id)) return [{ id, name: bystanderName(id), category: 'character' }];
          if (NPC_CORPS.has(id)) return [{ id, name: NPC_CORPS.get(id)!, category: 'corporation' }];
          const corp = corpById.get(id);
          if (corp) return [{ id, name: corp.name, category: 'corporation' }];
          const alliance = allianceById.get(id);
          if (alliance) return [{ id, name: alliance.name, category: 'alliance' }];
          return [];
        })
      );
    }
    const charInfo = /^\/characters\/(\d+)$/.exec(path);
    if (charInfo && pilotById.has(Number(charInfo[1])) && method === 'GET') {
      const p = pilotById.get(Number(charInfo[1]))!;
      const corp = corpById.get(p.corpId)!;
      return json(route, {
        name: p.name, corporation_id: corp.id, ...(corp.allianceId ? { alliance_id: corp.allianceId } : {}),
        birthday: iso(Date.now() - p.ageMonths * 30.4 * DAY), bloodline_id: 5, race_id: 1, gender: 'male',
        security_status: p.security,
      });
    }
    const history = /^\/characters\/(\d+)\/corporationhistory$/.exec(path);
    if (history && pilotById.has(Number(history[1]))) {
      const p = pilotById.get(Number(history[1]))!;
      const past = p.history ?? [];
      const rows = [
        { corporation_id: p.corpId, record_id: past.length + 2, start_date: iso(Date.now() - Math.max(60, p.ageMonths * 10) * DAY) },
        ...past.map((h, i) => ({ corporation_id: h.corpId, record_id: past.length + 1 - i, start_date: iso(Date.now() - h.startedDaysAgo * DAY) })),
        { corporation_id: 1_000_009, record_id: 1, start_date: iso(Date.now() - p.ageMonths * 30.4 * DAY) },
      ];
      return json(route, rows);
    }
    const corpInfo = /^\/corporations\/(\d+)$/.exec(path);
    if (corpInfo && corpById.has(Number(corpInfo[1]))) {
      const corp = corpById.get(Number(corpInfo[1]))!;
      return json(route, {
        name: corp.name, ticker: corp.ticker, ceo_id: PILOTS[0].id, creator_id: PILOTS[0].id, member_count: 40 + (corp.id % 90),
        tax_rate: 0.1, date_founded: '2019-03-14T10:00:00Z', ...(corp.allianceId ? { alliance_id: corp.allianceId } : {}),
      });
    }
    const allyInfo = /^\/alliances\/(\d+)$/.exec(path);
    if (allyInfo && allianceById.has(Number(allyInfo[1]))) {
      const a = allianceById.get(Number(allyInfo[1]))!;
      return json(route, { name: a.name, ticker: a.ticker, creator_id: PILOTS[0].id, creator_corporation_id: CORPS[0].id, date_founded: '2018-06-02T09:00:00Z', executor_corporation_id: CORPS[0].id });
    }
    // Arden's wallet journal: a few trades with the partner, so Interactions has rows.
    if (path === `/characters/${ARDEN.id}/wallet/journal` && method === 'GET') {
      const rows = [
        { id: 9_100_001, amount: 48_000_000, balance: 612_000_000, date: iso(Date.now() - 6 * DAY), description: 'Corvane Ashdell deposited cash', first_party_id: PARTNER.id, second_party_id: ARDEN.id, ref_type: 'player_donation', reason: 'Salvage split, thanks' },
        { id: 9_100_002, amount: -12_500_000, balance: 564_000_000, date: iso(Date.now() - 19 * DAY), description: 'Arden Kessil deposited cash into Corvane Ashdell', first_party_id: ARDEN.id, second_party_id: PARTNER.id, ref_type: 'player_donation', reason: 'Split of the fuel run' },
        { id: 9_100_003, amount: 31_000_000, balance: 576_000_000, date: iso(Date.now() - 41 * DAY), description: 'Contract payment', first_party_id: PARTNER.id, second_party_id: ARDEN.id, ref_type: 'contract_price', reason: '' },
      ];
      return json(route, rows);
    }
    return route.fallback();
  });
}

const row = (id: number, name: string, type: string, distance: string) => `${id}\t${name}\t${type}\t${distance}`;

/** The first D-Scan: a small gang (real ship type names). */
export const DSCAN_1 = [
  row(22456, 'Quiet Anvil', 'Sabre', '14 km'),
  row(29990, 'Verdant Lull', 'Loki', '22 km'),
  row(29990, 'Second Thoughts', 'Loki', '31 km'),
  row(12015, 'Ember Ledger', 'Muninn', '45 km'),
  row(12015, 'Salt Road', 'Muninn', '52 km'),
  row(11978, 'Warm Blanket', 'Scimitar', '61 km'),
  row(24702, 'Loose Change', 'Hurricane', '88 km'),
  row(20125, 'Night Shift', 'Curse', '280 km'),
  row(11961, 'Long Memory', 'Huginn', '1,420 km'),
  row(2185, '', 'Hammerhead II', '9 km'),
  row(2185, '', 'Hammerhead II', '11 km'),
  row(2488, '', 'Warrior II', '17 km'),
].join('\n');

/** The second D-Scan, a minute later: one Loki left, a Basilisk, an Arazu and a Rapier arrived (a ship type that vanished entirely would show as a bare type id, so one Loki leaves instead). */
export const DSCAN_2 = [
  row(22456, 'Quiet Anvil', 'Sabre', '9 km'),
  row(29990, 'Verdant Lull', 'Loki', '19 km'),
  row(12015, 'Ember Ledger', 'Muninn', '41 km'),
  row(12015, 'Salt Road', 'Muninn', '49 km'),
  row(11978, 'Warm Blanket', 'Scimitar', '58 km'),
  row(11985, 'Tidewater', 'Basilisk', '64 km'),
  row(24702, 'Loose Change', 'Hurricane', '80 km'),
  row(11963, 'Cold Comfort', 'Rapier', '95 km'),
  row(11969, 'Paper Moon', 'Arazu', '120 km'),
  row(20125, 'Night Shift', 'Curse', '260 km'),
  row(11961, 'Long Memory', 'Huginn', '1,380 km'),
  row(2185, '', 'Hammerhead II', '9 km'),
  row(2185, '', 'Hammerhead II', '12 km'),
  row(2488, '', 'Warrior II', '15 km'),
].join('\n');

/**
 * The sandbox has no Firebase, so "Copy Share Link" is disabled and nothing can store a scan.
 * For this capture only, the three modules involved are patched on their way to the page: the
 * button is enabled, saving a share is a no-op that returns an expiry, the link is built on the
 * app's own domain, and the first copy is refused so the link is shown in its field ("manual").
 * No source file is touched.
 */
export async function installShareStub(page: Page) {
  const patch = async (glob: string, edit: (code: string) => string) => {
    await page.route(glob, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: edit(await response.text()) });
    });
  };
  await patch('**/src/features/travel/PilotListView.tsx*', (code) =>
    code
      .replace('!isSyncConfigured()', 'false')
      .replace(/await writeToClipboard\(url\);/, 'await Promise.reject(new Error("manual"));')
  );
  await patch('**/src/features/share/shareStore.ts*', (code) =>
    code
      .replace(/export async function saveShare\(input\) \{/, 'export async function saveShare(input) { return Date.now() + 7 * 86400000;')
      .replace(/return appUrl\(`\/s\/\$\{id\}`\);/, 'return `https://neocomdesk.com/s/${id}`;')
  );
}
