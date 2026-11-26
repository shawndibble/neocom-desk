/**
 * The deep-dive world's cast: three signed-in characters, one corporation, one alliance.
 * Every name is invented. Arden reuses the e2e fixture's CHARACTER_ID (90000001) on purpose, so
 * the sandbox's generated mail, contracts, industry jobs, mining and corp data (keyed by that
 * id) land on the main character; only the names are overridden (world.ts).
 */
import { ALLIANCE_ID, CHARACTER_ID, CORPORATION_ID } from '../../../../e2e/support/fixtureData';

export const ARDEN = { id: CHARACTER_ID, name: 'Arden Kessil', ownerHash: 'WORLD-ARDEN' } as const;
export const MIRA = { id: 90_000_011, name: 'Mira Voskane', ownerHash: 'WORLD-MIRA' } as const;
export const TOBIN = { id: 90_000_012, name: 'Tobin Raske', ownerHash: 'WORLD-TOBIN' } as const;

export type CastMember = { id: number; name: string; ownerHash: string };
export const CAST: readonly CastMember[] = [ARDEN, MIRA, TOBIN];
export const CAST_IDS: readonly number[] = CAST.map((member) => member.id);

export const CORPORATION = {
  id: CORPORATION_ID,
  name: 'Halcyon Forge Industries',
  ticker: 'HFIND',
} as const;
export const ALLIANCE = {
  id: ALLIANCE_ID,
  name: 'Northern Lantern Collective',
  ticker: 'NLC',
} as const;

/** Systems and stations (real ids from public/data/market). */
export const SYSTEMS = {
  nourvukaiken: 30001376, // Lonetrek, 0.82
  tunttaras: 30001379, // Lonetrek, 0.89
  sarekuwa: 30001377, // Lonetrek, 0.94
  jita: 30000142, // The Forge
  amarr: 30002187, // Domain
  dodixie: 30002659, // Sinq Laison
  rens: 30002510, // Heimatar
} as const;

export const STATIONS = {
  /** Nourvukaiken 3 - Caldari Navy Assembly Plant. Arden's home station. */
  nourvukaiken: 60003832,
  /** Tunttaras 10 - Moon 3 - Caldari Navy Logistic Support. Mira's base. */
  tunttaras: 60003826,
  /** Sarekuwa 3 - Moon 8 - Caldari Navy Assembly Plant. */
  sarekuwa: 60003838,
  /** Jita 4 - Moon 4 - Caldari Navy Assembly Plant. Tobin's base. */
  jita: 60003760,
  /** Amarr VIII (Oris) - Emperor Family Academy. */
  amarr: 60008494,
  /** Dodixie 9 - Moon 20 - Federation Navy Assembly Plant. */
  dodixie: 60011866,
  /** Rens 6 - Moon 8 - Brutor Tribe Treasury. */
  rens: 60004588,
} as const;

export const REGIONS = {
  lonetrek: 10000016,
  forge: 10000002,
  domain: 10000043,
  sinqLaison: 10000032,
  heimatar: 10000030,
} as const;

/** station id -> { systemId, regionId } for every station the world knows. */
export const STATION_PLACE: Record<number, { systemId: number; regionId: number; system: string }> =
  {
    [STATIONS.nourvukaiken]: {
      systemId: SYSTEMS.nourvukaiken,
      regionId: REGIONS.lonetrek,
      system: 'Nourvukaiken',
    },
    [STATIONS.tunttaras]: {
      systemId: SYSTEMS.tunttaras,
      regionId: REGIONS.lonetrek,
      system: 'Tunttaras',
    },
    [STATIONS.sarekuwa]: {
      systemId: SYSTEMS.sarekuwa,
      regionId: REGIONS.lonetrek,
      system: 'Sarekuwa',
    },
    [STATIONS.jita]: { systemId: SYSTEMS.jita, regionId: REGIONS.forge, system: 'Jita' },
    [STATIONS.amarr]: { systemId: SYSTEMS.amarr, regionId: REGIONS.domain, system: 'Amarr' },
    [STATIONS.dodixie]: {
      systemId: SYSTEMS.dodixie,
      regionId: REGIONS.sinqLaison,
      system: 'Dodixie',
    },
    [STATIONS.rens]: { systemId: SYSTEMS.rens, regionId: REGIONS.heimatar, system: 'Rens' },
  };

/** Non-cast counterparties the wallet names (ids in the sandbox's generated pilot range). */
export const NPC = {
  concord: { id: 1_000_125, name: 'CONCORD' },
  scc: { id: 1_000_132, name: 'Secure Commerce Commission' },
  caldariNavy: { id: 1_000_035, name: 'Caldari Navy' },
} as const;
