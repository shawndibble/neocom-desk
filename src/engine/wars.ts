/**
 * Wars declared on a pilot's corporation, with no fetch or DOM in it.
 *
 * ESI cannot list the wars of one corporation, so the app reads a short list
 * of every open war that `syncActiveWars` keeps in Firestore
 * (`systemConditions/activeWars`) and picks its own out of it here. A war's
 * `allies` are always on the defender's side: only a defender can hire them,
 * so an ally is as much "at war" as the target is.
 *
 * Times are epoch ms, converted from ESI's ISO strings by the writer.
 */

export interface WarParty {
  corporationId?: number;
  allianceId?: number;
  iskDestroyed: number;
  shipsKilled: number;
}

export interface WarAlly {
  corporationId?: number;
  allianceId?: number;
}

export interface StoredWar {
  id: number;
  declared: number;
  /** Absent until ESI reports one. */
  started?: number;
  /** Absent while the war has no end set. A future value is a war on its way out. */
  finished?: number;
  mutual: boolean;
  openForAllies: boolean;
  aggressor: WarParty;
  defender: WarParty;
  allies: WarAlly[];
}

export interface StoredWars {
  /** Epoch ms the sweep last confirmed this list. */
  updatedAt: number;
  wars: StoredWar[];
}

/** Whose wars to look for: a corporation, and the alliance it is in, if any. */
export interface WarEntityIds {
  corporationId?: number;
  allianceId?: number;
}

export type WarStatus =
  | { kind: 'pending'; startsIn: number | null }
  | { kind: 'active'; endsIn: number | null }
  | { kind: 'over' };

export function warStatus(war: StoredWar, now: number): WarStatus {
  if (war.finished !== undefined && war.finished <= now) return { kind: 'over' };
  if (war.started === undefined) return { kind: 'pending', startsIn: null };
  if (war.started > now) return { kind: 'pending', startsIn: war.started - now };
  return { kind: 'active', endsIn: war.finished === undefined ? null : war.finished - now };
}

export type WarSide = 'defender' | 'ally';

export interface WarAgainstMe {
  war: StoredWar;
  side: WarSide;
  status: Exclude<WarStatus, { kind: 'over' }>;
}

function matches(
  party: { corporationId?: number; allianceId?: number },
  me: WarEntityIds
): boolean {
  return (
    (me.corporationId !== undefined && party.corporationId === me.corporationId) ||
    (me.allianceId !== undefined && party.allianceId === me.allianceId)
  );
}

/**
 * The wars still running (or about to) with `me` on the receiving end, an
 * active war ahead of a pending one, then newest declared first. A war `me`
 * declared is not "against" me and is left out.
 */
export function warsAgainst(
  wars: readonly StoredWar[],
  me: WarEntityIds,
  now: number
): WarAgainstMe[] {
  const hits: WarAgainstMe[] = [];
  for (const war of wars) {
    if (matches(war.aggressor, me)) continue;
    const side: WarSide | null = matches(war.defender, me)
      ? 'defender'
      : war.allies.some((ally) => matches(ally, me))
        ? 'ally'
        : null;
    if (side === null) continue;
    const status = warStatus(war, now);
    if (status.kind === 'over') continue;
    hits.push({ war, side, status });
  }
  return hits.sort(
    (a, b) =>
      Number(b.status.kind === 'active') - Number(a.status.kind === 'active') ||
      b.war.declared - a.war.declared
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const isNum = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);
const optNum = (value: unknown): value is number | undefined => value === undefined || isNum(value);

function isParty(value: unknown): value is WarParty {
  return (
    isRecord(value) &&
    optNum(value.corporationId) &&
    optNum(value.allianceId) &&
    isNum(value.iskDestroyed) &&
    isNum(value.shipsKilled)
  );
}

function isAlly(value: unknown): value is WarAlly {
  return isRecord(value) && optNum(value.corporationId) && optNum(value.allianceId);
}

function isStoredWar(value: unknown): value is StoredWar {
  return (
    isRecord(value) &&
    isNum(value.id) &&
    isNum(value.declared) &&
    optNum(value.started) &&
    optNum(value.finished) &&
    typeof value.mutual === 'boolean' &&
    typeof value.openForAllies === 'boolean' &&
    isParty(value.aggressor) &&
    isParty(value.defender) &&
    Array.isArray(value.allies) &&
    value.allies.every(isAlly)
  );
}

/**
 * The Firestore doc as a typed list, or null for a doc that is not the shape
 * the writer produces. One bad row is dropped rather than losing the list: a
 * pilot should still see the war that did parse.
 */
export function parseStoredWars(doc: unknown): StoredWars | null {
  if (!isRecord(doc) || !isNum(doc.updatedAt) || !Array.isArray(doc.wars)) return null;
  return { updatedAt: doc.updatedAt, wars: doc.wars.filter(isStoredWar) };
}
