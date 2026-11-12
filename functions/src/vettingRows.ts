// Vetting: ESI rows to the dealings the checks read (vettingEngine.ts). Pure. A dealing keeps
// who the other side was, when, and the source's own word for the row; never a mail subject or
// body, a contract title or a journal description.

import { isFiniteNumber, isPlainRecord } from './guards.js';
import type { VettingCharacterInput, VettingDealing } from './vettingEngine.js';

/**
 * Characters, player corporations and alliances all sit at or above this id. Below it are
 * NPC corporations, agents, factions and the system itself (a bounty from CONCORD, a station
 * fee), which no watchlist can hold and which would crowd out the rows that matter.
 */
const PLAYER_ID_FLOOR = 90_000_000;

function playerId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= PLAYER_ID_FLOOR
    ? value
    : null;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, 64) : null;

export function walletDealings(characterId: number, rows: readonly unknown[]): VettingDealing[] {
  return rows.flatMap((row): VettingDealing[] => {
    if (!isPlainRecord(row)) return [];
    const first = row.first_party_id;
    const second = row.second_party_id;
    const other = first === characterId ? second : second === characterId ? first : null;
    const partyId = playerId(other);
    const what = text(row.ref_type);
    const at = text(row.date);
    if (partyId === null || partyId === characterId || what === null || at === null) return [];
    return [
      {
        source: 'wallet',
        at,
        partyId,
        what,
        ...(isFiniteNumber(row.amount) ? { amount: row.amount } : {}),
      },
    ];
  });
}

const CONTACT_TYPES = ['character', 'corporation', 'alliance'];

export function contactDealings(rows: readonly unknown[]): VettingDealing[] {
  return rows.flatMap((row): VettingDealing[] => {
    if (!isPlainRecord(row)) return [];
    const partyId = playerId(row.contact_id);
    if (partyId === null || !CONTACT_TYPES.includes(row.contact_type as string)) return [];
    if (!isFiniteNumber(row.standing)) return [];
    return [{ source: 'contact', at: null, partyId, what: 'contact', standing: row.standing }];
  });
}

/** One dealing per mail header and other side: the sender, or each recipient of a mail sent. */
export function mailDealings(characterId: number, rows: readonly unknown[]): VettingDealing[] {
  return rows.flatMap((row): VettingDealing[] => {
    if (!isPlainRecord(row)) return [];
    const at = text(row.timestamp);
    if (at === null) return [];
    const others: number[] = [];
    if (row.from !== characterId) {
      const from = playerId(row.from);
      if (from !== null) others.push(from);
    } else if (Array.isArray(row.recipients)) {
      for (const recipient of row.recipients as unknown[]) {
        if (!isPlainRecord(recipient)) continue;
        if (!CONTACT_TYPES.includes(recipient.recipient_type as string)) continue;
        const id = playerId(recipient.recipient_id);
        if (id !== null && id !== characterId && !others.includes(id)) others.push(id);
      }
    }
    return others.map((partyId) => ({ source: 'mail', at, partyId, what: 'mail' }));
  });
}

/** ISK the contract moves, from the issuer's side, where the type says which way it goes. */
function issuerAmount(row: Record<string, unknown>): { amount: number; signed: boolean } | null {
  const price = isFiniteNumber(row.price) ? row.price : null;
  const reward = isFiniteNumber(row.reward) ? row.reward : null;
  if (row.type === 'item_exchange') {
    if (price === null && reward === null) return null;
    return { amount: (price ?? 0) - (reward ?? 0), signed: true };
  }
  if (row.type === 'courier') {
    return reward === null ? null : { amount: -reward, signed: true };
  }
  return price === null ? null : { amount: price, signed: false };
}

export function contractDealings(characterId: number, rows: readonly unknown[]): VettingDealing[] {
  return rows.flatMap((row): VettingDealing[] => {
    if (!isPlainRecord(row)) return [];
    const issued = row.issuer_id === characterId;
    const partyId = playerId(issued ? row.acceptor_id : row.issuer_id);
    const what = text(row.type);
    const at = text(row.date_issued);
    if (partyId === null || partyId === characterId || what === null || at === null) return [];
    const dealing: VettingDealing = { source: 'contract', at, partyId, what };
    const moved = issuerAmount(row);
    if (issued || row.acceptor_id === characterId) {
      // `|| 0`: a free contract is 0, never -0.
      if (moved) dealing.amount = (moved.signed && !issued ? -moved.amount : moved.amount) || 0;
    } else if (isFiniteNumber(row.price)) {
      // Only assigned to this character, not accepted: nothing moved yet, so the price as given.
      dealing.amount = row.price;
    }
    return [dealing];
  });
}

export function skillsOf(
  body: unknown
): Pick<VettingCharacterInput, 'skillPoints' | 'skills'> | null {
  if (!isPlainRecord(body) || !isFiniteNumber(body.total_sp)) return null;
  const skills = Array.isArray(body.skills) ? (body.skills as unknown[]) : [];
  return {
    skillPoints: body.total_sp,
    skills: skills.flatMap((skill) =>
      isPlainRecord(skill) &&
      isFiniteNumber(skill.skill_id) &&
      isFiniteNumber(skill.trained_skill_level)
        ? [{ id: skill.skill_id, level: skill.trained_skill_level }]
        : []
    ),
  };
}

export function historyOf(rows: readonly unknown[]): VettingCharacterInput['history'] {
  return rows.flatMap((row) =>
    isPlainRecord(row) && isFiniteNumber(row.corporation_id) && typeof row.start_date === 'string'
      ? [{ corporationId: row.corporation_id, startDate: row.start_date }]
      : []
  );
}

/** At most `max` dealings: every undated one (contacts), then the newest of the rest. */
export function capDealings(dealings: readonly VettingDealing[], max: number): VettingDealing[] {
  if (dealings.length <= max) return [...dealings];
  const undated = dealings.filter((dealing) => dealing.at === null);
  const dated = dealings
    .filter((dealing) => dealing.at !== null)
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return [...undated, ...dated].slice(0, max);
}
