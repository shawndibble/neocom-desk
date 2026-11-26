import {
  VETTING_RAW_SOURCES,
  type VettingDealing,
  type VettingParty,
  type VettingRawPage,
  type VettingRawRow,
  type VettingRawSource,
} from '@/engine/vetting';
import { DAY_MS, HOUR_MS } from '@/lib/age';

export interface RawSample {
  characterId: number;
  corporationId: number;
  years: number;
  corporations: number;
  missing?: readonly string[];
  dealings?: (now: number) => VettingDealing[];
  skills?: { id: number; level: number }[];
}

export type RawSet = Record<VettingRawSource, VettingRawRow[]>;

export const RAW_CHUNK = 500;
export const RAW_BUSY_WALLET_ROWS = 4652;
const BUSY_CHARACTER = 2118000001;

const FILLER_CHARACTERS: VettingParty[] = Array.from({ length: 12 }, (_, index) => ({
  id: 2118000100 + index,
  name: `${['Ansel', 'Brisa', 'Calder', 'Dessa', 'Eron', 'Fenna'][index % 6]} ${['Marsh', 'Okoro'][index % 2]}`,
  category: 'character' as const,
}));
const FILLER_CORPORATIONS: VettingParty[] = [
  'Quiet Harbor Freight',
  'Jita Hauling Co',
  'Amarr Trade Union',
  'Pale Lantern',
].map((name, index) => ({ id: 98333001 + index, name, category: 'corporation' as const }));

const WALLET_TYPES = [
  'market_transaction',
  'market_escrow',
  'brokers_fee',
  'bounty_prizes',
  'player_donation',
  'insurance',
  'transaction_tax',
];
const FILLER_SKILLS = [3300, 3301, 3302, 3310, 3327, 3380, 3386, 3392, 3402, 3413];

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

export function rawParties(known: readonly VettingParty[]): VettingParty[] {
  return [...known, ...FILLER_CHARACTERS, ...FILLER_CORPORATIONS];
}

function rowOf(characterId: number, dealing: VettingDealing): VettingRawRow {
  const row: VettingRawRow = {
    characterId,
    at: dealing.at,
    what: dealing.source === 'contact' ? 'character' : dealing.what,
    partyId: dealing.partyId,
  };
  if (dealing.amount !== undefined) row.amount = dealing.amount;
  if (dealing.standing !== undefined) row.standing = dealing.standing;
  if (dealing.source === 'contract') row.status = 'finished';
  return row;
}

export function rawRowsFor(samples: readonly RawSample[], now: number): RawSet {
  const set: RawSet = { wallet: [], contact: [], mail: [], contract: [], skills: [], history: [] };
  for (const sample of samples) {
    const random = seeded(sample.characterId);
    const id = sample.characterId;
    for (const dealing of sample.dealings?.(now) ?? []) {
      if (dealing.source === 'mail') continue;
      const source = dealing.source === 'wallet' ? 'wallet' : dealing.source;
      set[source].push(rowOf(id, dealing));
    }
    if (id === BUSY_CHARACTER) {
      const have = set.wallet.length;
      for (let index = have; index < RAW_BUSY_WALLET_ROWS; index += 1) {
        const what = WALLET_TYPES[Math.floor(random() * WALLET_TYPES.length)] ?? 'insurance';
        const row: VettingRawRow = {
          characterId: id,
          at: iso(now - Math.floor(random() * 30 * DAY_MS)),
          what,
          amount: Math.round((random() - 0.45) * 40_000_000),
        };
        if (what !== 'transaction_tax' && what !== 'brokers_fee') {
          row.partyId = FILLER_CHARACTERS[Math.floor(random() * FILLER_CHARACTERS.length)]?.id;
        }
        set.wallet.push(row);
      }
    }
    if (!sample.missing?.includes('mail')) {
      for (let index = 0; index < 6; index += 1) {
        const other = FILLER_CHARACTERS[Math.floor(random() * FILLER_CHARACTERS.length)]!.id;
        const sent = index % 2 === 0;
        set.mail.push({
          characterId: id,
          at: iso(now - (index + 1) * DAY_MS - Math.floor(random() * HOUR_MS * 8)),
          what: sent ? 'Sent' : 'Received',
          partyId: other,
          recipients: sent ? [other] : [id, other],
        });
      }
    }
    for (const skill of sample.skills ?? []) {
      set.skills.push({
        characterId: id,
        at: null,
        what: '',
        skillId: skill.id,
        level: skill.level,
      });
    }
    for (const skillId of FILLER_SKILLS) {
      set.skills.push({
        characterId: id,
        at: null,
        what: '',
        skillId,
        level: 1 + Math.floor(random() * 5),
      });
    }
    const stays = Math.max(1, sample.corporations);
    let joined = now - sample.years * 365 * DAY_MS;
    for (let index = 0; index < stays; index += 1) {
      const last = index === stays - 1;
      const left = last ? null : joined + Math.floor((sample.years * 365 * DAY_MS) / stays);
      set.history.push({
        characterId: id,
        at: iso(joined),
        what: '',
        corporationId: last
          ? sample.corporationId
          : FILLER_CORPORATIONS[index % FILLER_CORPORATIONS.length]!.id,
        joined: iso(joined),
        left: left === null ? null : iso(left),
      });
      if (left !== null) joined = left;
    }
  }
  return set;
}

export function rawCountsOf(set: RawSet): Record<VettingRawSource, number> {
  return Object.fromEntries(
    VETTING_RAW_SOURCES.map((source) => [source, set[source].length])
  ) as Record<VettingRawSource, number>;
}

function chunksOf(rows: readonly VettingRawRow[]): VettingRawRow[][] {
  const byCharacter = new Map<number, VettingRawRow[]>();
  for (const row of rows)
    byCharacter.set(row.characterId, [...(byCharacter.get(row.characterId) ?? []), row]);
  const perCharacter = [...byCharacter.values()].map((list) => {
    const chunks: VettingRawRow[][] = [];
    for (let at = 0; at < list.length; at += RAW_CHUNK) chunks.push(list.slice(at, at + RAW_CHUNK));
    return chunks;
  });
  const out: VettingRawRow[][] = [];
  for (let round = 0; perCharacter.some((chunks) => round < chunks.length); round += 1) {
    for (const chunks of perCharacter) if (chunks[round]) out.push(chunks[round]!);
  }
  return out;
}

export function rawPage(
  reviewId: string,
  source: VettingRawSource,
  set: RawSet,
  parties: readonly VettingParty[],
  cursor?: string
): VettingRawPage {
  const chunks = chunksOf(set[source]);
  const at = cursor ? Number(cursor) : 0;
  const rows = chunks[at] ?? [];
  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of [row.partyId, row.corporationId, ...(row.recipients ?? [])]) {
      if (id !== undefined) ids.add(id);
    }
  }
  return {
    reviewId,
    source,
    rows,
    parties: parties.filter((party) => ids.has(party.id)),
    next: at + 1 < chunks.length ? String(at + 1) : null,
  };
}
