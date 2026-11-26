import {
  BookSeed,
  DAY_QTY,
  DAY_TAX,
  ORE_TYPE,
  REFINERY,
  day,
  noonOf,
  verifyToken,
} from './bookSeed';
import type { SeedDoc } from './emulator';
import { OFFICER_SCOPES, type EsiOverride } from './bookTest';
import { signedAccessToken } from './eveToken';
import { CORP, MINER, OFFICER, OTHER_CORP, corpOf, nameOf } from './identities';
import type { Page } from '@playwright/test';
import { PERSONAL_SYSTEM_ID } from './personalSeed';

export const PILOT = { id: OFFICER.id, name: OFFICER.name };
export const PILOT_ALT = MINER.pilotAlt;
export const PILOT_MINER_ID = 'm-pilot';
export const PERSONAL_SYSTEM = PERSONAL_SYSTEM_ID;
export const PERSONAL_PAYEE = { ...MINER.rook, taxPct: 10 };

export function miningLedger(
  days: readonly number[],
  solarSystemId: number = REFINERY.alpha.systemId,
  now = Date.now()
) {
  return days.map((back) => ({
    date: day(back, now),
    quantity: DAY_QTY,
    solar_system_id: solarSystemId,
    type_id: ORE_TYPE,
  }));
}

export function donationSent(p: {
  refId: number;
  to: number;
  from?: { id: number; name: string };
  amount: number;
  back: number;
  reason?: string;
  now?: number;
  at?: string;
}) {
  return {
    id: p.refId,
    date: p.at ?? noonOf(p.back, p.now),
    ref_type: 'player_donation',
    description: `${(p.from ?? PILOT).name} deposited cash into ${p.to}'s account`,
    amount: -p.amount,
    first_party_id: (p.from ?? PILOT).id,
    second_party_id: p.to,
    ...(p.reason ? { reason: p.reason } : {}),
  };
}

export function pilotEsi(p: {
  mining: ReturnType<typeof miningLedger>;
  journal?: ReturnType<typeof donationSent>[];
}): EsiOverride {
  return (path: string) => {
    if (path === `/characters/${PILOT.id}/mining`) return p.mining;
    if (path === `/characters/${PILOT.id}/wallet/journal`) return p.journal ?? [];
    return undefined;
  };
}

export function memberBook(bookDays: readonly number[] = [6, 5, 4]) {
  const seed = new BookSeed({ startBack: 40 })
    .group(PILOT_MINER_ID, [PILOT.id, PILOT_ALT.id])
    .mine(PILOT.id, bookDays);
  return {
    seed,
    bookDays,
    owed: bookDays.length * DAY_TAX,
    personalDays: [5, 4],
    esi: (journal: ReturnType<typeof donationSent>[] = []) =>
      pilotEsi({
        mining: [...miningLedger(bookDays), ...miningLedger([5, 4], PERSONAL_SYSTEM)],
        journal,
      }),
  };
}

export const SETTLE_UP = {
  exact: 3 * DAY_TAX,
  short: 2.5 * DAY_TAX,
  over: 3.5 * DAY_TAX,
} as const;

export function creditedDonation(p: {
  corporationId?: number;
  refId: number;
  characterId: number;
  amount: number;
  back: number;
  minerId?: string;
  now?: number;
  at?: string;
}): SeedDoc {
  const id = `j1_${p.refId}`;
  return {
    path: `corps/${p.corporationId ?? CORP}/payments/${id}`,
    data: {
      id,
      source: 'donation',
      characterId: p.characterId,
      uid: `char:${p.characterId}`,
      amount: p.amount,
      at: p.at ?? noonOf(p.back, p.now),
      division: 1,
      minerId: p.minerId ?? PILOT_MINER_ID,
    },
  };
}

export const ALT_B = MINER.pilotAltB;
export { OTHER_CORP };

export async function seedTrackedAlt(page: Page, alt = ALT_B, corporationId = OTHER_CORP) {
  const accessToken = signedAccessToken({
    characterId: alt.id,
    name: alt.name,
    ownerHash: 'OWNERHASH-ALT',
    scopes: OFFICER_SCOPES,
  });
  await page.evaluate(
    async (seed) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['characters', 'tokens'], 'readwrite');
        tx.objectStore('characters').put({
          characterId: seed.id,
          name: seed.name,
          ownerHash: 'OWNERHASH-ALT',
          addedAt: Date.now(),
          corporationId: seed.corporationId,
        });
        tx.objectStore('tokens').put({
          characterId: seed.id,
          accessToken: seed.accessToken,
          refreshToken: 'fake-refresh',
          expiresAt: Date.now() + 3_600_000 * 24,
          scopes: seed.scopes,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { ...alt, corporationId, accessToken, scopes: [...OFFICER_SCOPES] }
  );
}

export function characterEsi(
  characterId: number,
  p: { mining: ReturnType<typeof miningLedger>; journal?: ReturnType<typeof donationSent>[] }
): EsiOverride {
  return (path: string) => {
    if (path === `/characters/${characterId}/mining`) return p.mining;
    if (path === `/characters/${characterId}/wallet/journal`) return p.journal ?? [];
    if (path === `/characters/${characterId}`)
      return { name: nameOf(characterId), corporation_id: corpOf(characterId) };
    if (path === `/characters/${characterId}/roles`) return { roles: [] };
    if (path === `/characters/${characterId}/contracts`) return [];
    if (path === `/characters/${characterId}/skillqueue`) return [];
    if (path === `/characters/${characterId}/clones`) return { jump_clones: [] };
    if (path === `/characters/${characterId}/location`) return { solar_system_id: 30000142 };
    return undefined;
  };
}

export function notesBook() {
  const oldDays = [30, 29];
  const newDays = [6, 5, 4];
  const seed = new BookSeed({ startBack: 60 })
    .group(PILOT_MINER_ID, [PILOT.id])
    .mine(PILOT.id, [...oldDays, ...newDays])
    .lateNotice({
      id: 'ln-pilot',
      characterId: PILOT.id,
      minerId: PILOT_MINER_ID,
      days: oldDays,
      issuedBack: 25,
      token: verifyToken('pilot-notes'),
    });
  return {
    seed,
    owed: (oldDays.length + newDays.length) * DAY_TAX,
    esi: pilotEsi({ mining: miningLedger([...oldDays, ...newDays]) }),
  };
}
