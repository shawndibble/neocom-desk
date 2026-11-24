/**
 * Sample data for the Campaign turn-ins mockups (docs/design/mockups/campaign-turn-ins/):
 * Fractured Skies Campaign Objectives of type "item traded", their Item Traders,
 * and the Characters whose Military Campaigns Permission differs.
 *
 * Turn-in Reward = ISK per item + LP per full 100 items × the issuing corporation's
 * LP Value (assumed 800 ISK/LP here). Faction tokens are never in the figure.
 */
import { db } from '@/db';
import { HOUR_MS } from '@/lib/age';
import { ACTIVE_CHARACTER_KEY } from '@/stores/activeCharacter';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { haulingFixtureRoutes, HAULING_SCOPES } from '@/storybook/haulingFixtures';

/** What the app knows about one Character's Military Campaigns Permission and sign-up. */
export type TurnInState =
  /** Permission granted and the Character pressed Participate: nothing extra shows. */
  | 'participating'
  /** Permission granted, not signed up: the warning line. */
  | 'notSignedUp'
  /** Permission missing, not dismissed: the amber mark that opens the grant popover. */
  | 'missing'
  /** "Don't ask again" pressed (account-wide): no mark; the figure's tooltip carries the caveat. */
  | 'dismissed'
  /** No active Character: the plain caveat line. */
  | 'noCharacter';

export const LP_VALUE = 800;

export interface TurnInItem {
  typeId: number;
  name: string;
  trader: string;
  system: string;
  corporation: string;
  faction: 'Amarr' | 'Caldari' | 'Gallente' | 'Minmatar';
  iskPerItem: number;
  lpPer100: number;
  /** Community fill of the Campaign Objective, 0-100. */
  filledPct: number;
  /** Jita best buy (Sell now) and best sell, ISK each. */
  jitaBuy: number;
  jitaSell: number;
}

export const FAILOVER: TurnInItem = {
  typeId: 97545,
  name: 'Shield Failover Report',
  trader: 'Secure Strength Trader',
  system: 'Onnamon',
  corporation: 'Caldari Navy',
  faction: 'Caldari',
  iskPerItem: 28_000,
  lpPer100: 4_000,
  filledPct: 17,
  jitaBuy: 55_200,
  jitaSell: 58_000,
};

export const STEREO: TurnInItem = {
  typeId: 97547,
  name: 'Stereo-Collapse Signal',
  trader: 'Trail of Silence Trader',
  system: 'Amo',
  corporation: 'Republic Fleet',
  faction: 'Minmatar',
  iskPerItem: 28_000,
  lpPer100: 4_000,
  filledPct: 31,
  jitaBuy: 54_100,
  jitaSell: 59_000,
};

export const STRATEGIC_INTEL: TurnInItem = {
  typeId: 97549,
  name: 'Federation Strategic Intel',
  trader: 'Secure Strength Trader',
  system: 'Onnamon',
  corporation: 'Caldari Navy',
  faction: 'Caldari',
  iskPerItem: 32_000,
  lpPer100: 2_000,
  filledPct: 12,
  jitaBuy: 40_000,
  jitaSell: 44_500,
};

export const FLUX_LOG: TurnInItem = {
  typeId: 97544,
  name: 'Thermoelectric Flux Log',
  trader: 'Into the Light Trader',
  system: 'Mehatoor',
  corporation: 'Amarr Navy',
  faction: 'Amarr',
  iskPerItem: 28_000,
  lpPer100: 4_000,
  filledPct: 22,
  jitaBuy: 41_300,
  jitaSell: 47_900,
};

/** The Turn-in Reward per item: ISK plus the LP share at the LP Value. */
export function rewardEach(item: TurnInItem): number {
  return item.iskPerItem + (item.lpPer100 / 100) * LP_VALUE;
}

/** What `quantity` items pay: LP only for each full 100. */
export function rewardTotal(item: TurnInItem, quantity: number): number {
  return item.iskPerItem * quantity + Math.floor(quantity / 100) * item.lpPer100 * LP_VALUE;
}

/** "~60k": the rounded figure the notes print. */
export function approxK(isk: number): string {
  if (Math.abs(isk) >= 1_000_000) return `~${(isk / 1_000_000).toFixed(1)}M`;
  return `~${Math.round(isk / 1_000)}k`;
}

export interface MockCharacter {
  characterId: number;
  name: string;
  state: Exclude<TurnInState, 'noCharacter'>;
}

/** A third Character, seeded beside the two sample ones, who lacks the Permission. */
export const MIRA = { characterId: 2119876545, name: 'Mira Solenne' };

/** Kestrel signed up, Orsa granted but not signed up, Mira never granted. */
export const CHARACTERS: Record<'kestrel' | 'orsa' | 'mira', MockCharacter> = {
  kestrel: { ...SAMPLE_CHARACTERS[0], state: 'participating' },
  orsa: { ...SAMPLE_CHARACTERS[1], state: 'notSignedUp' },
  mira: { ...MIRA, state: 'missing' },
};

/** Adds Mira to the shell's sample account so the rail's switcher lists three Characters. */
export async function seedThreeCharacters() {
  await db.characters.put({
    characterId: MIRA.characterId,
    name: MIRA.name,
    ownerHash: `sample-owner-${MIRA.characterId}`,
    addedAt: 3,
  });
  await db.tokens.put({
    characterId: MIRA.characterId,
    accessToken: 'sample-access-token',
    refreshToken: 'sample-refresh-token',
    expiresAt: Date.now() + HOUR_MS,
    scopes: ['esi-wallet.read_character_wallet.v1'],
  });
}

/** Signs the shell out of its active Character, for the no-Character caveat line. */
export async function seedNoActiveCharacter() {
  await db.settings.delete(ACTIVE_CHARACTER_KEY);
}

/** The shell's scopes and ESI answers: the Hauling set, so the shell asks for no grant of its own. */
export function turnInShell(path: string, seed?: () => Promise<void>) {
  return { path, routes: haulingFixtureRoutes, scopes: HAULING_SCOPES, seed };
}

export const PHONE = { viewport: { value: 'mobile1', isRotated: false } };

export const PAYS_ONLY_IF = "Pays only if you've pressed Participate on the opportunity";

export const PAYS_ONLY_IF_SHORT = "Pays only if you've pressed Participate";

export const NOT_SIGNED_UP = 'Not signed up: press Participate now in the Opportunities window';

export const WHY_MILITARY_CAMPAIGNS = (character: string) =>
  `Lets Neocom Desk see whether ${character} pressed Participate, so it can tell you if this turn-in pays.`;

/** The Character's Permission to set autopilot waypoints, in the Write to EVE section. */
export type WriteState = 'granted' | 'missing' | 'dismissed' | 'noCharacter';

/** GLOSSARY: one Permission per feature; "Autopilot waypoints" sits in the Write to EVE section. */
export const WAYPOINT_PERMISSION = 'Autopilot waypoints';

export const WHY_WAYPOINTS = (character: string) =>
  `Lets Neocom Desk set ${character}'s autopilot destination in the EVE client (Write to EVE).`;

/** LP paid per item, and what it is worth at the LP Value. */
export function lpEach(item: TurnInItem): number {
  return item.lpPer100 / 100;
}

/** "28,000 ISK + 40 LP (~32k)": the reward's split. */
export function rewardSplit(item: TurnInItem): string {
  return `${item.iskPerItem.toLocaleString('en-US')} ISK + ${lpEach(item)} LP (${approxK(lpEach(item) * LP_VALUE)})`;
}
