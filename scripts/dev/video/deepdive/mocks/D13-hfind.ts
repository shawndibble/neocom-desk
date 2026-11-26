/** D13: Halcyon Forge Industries' invented roster, structures and moons. Shared by the ESI mock and the Firestore seed. */
export const CORP_ID = 98_000_001;
export const OFFICER_ID = 90_000_001;
const D = 86_400_000;
const H = 3_600_000;

export interface Member {
  id: number;
  name: string;
  roles: string[];
  /** Days since last logoff; null = never seen. */
  silentDays: number | null;
  joinedDaysAgo: number;
  ship: number;
  title: number;
}
const NAMES: [string, string[], number | null, number][] = [
  ['Halvard Reeve', ['Director', 'Station_Manager', 'Personnel_Manager', 'Accountant', 'Security_Officer'], 0.2, 1400],
  ['Isolde Carrow', ['Director', 'Station_Manager', 'Accountant'], 0.6, 1300],
  ['Nikolai Brandt', ['Director', 'Personnel_Manager'], 96, 1250],
  ['Petra Lindqvist', ['Station_Manager', 'Config_Equipment', 'Factory_Manager'], 0.4, 900],
  ['Kaelen Voss', ['Station_Manager'], 1.1, 700],
  ['Oriel Tanvar', ['Accountant', 'Junior_Accountant'], 2.3, 640],
  ['Sennet Hale', ['Junior_Accountant'], 0.9, 610],
  ['Rhosyn Marek', ['Hangar_Take_1', 'Hangar_Query_1'], 1.6, 580],
  ['Dagny Alvane', ['Hangar_Take_1', 'Hangar_Query_1', 'Container_Take_1'], 3.4, 540],
  ['Joren Fell', ['Factory_Manager'], 0.3, 520],
  ['Katrin Solveig', [], 5.2, 500],
  ['Lucan Dray', [], 0.7, 470],
  ['Maren Ostrander', [], 11, 450],
  ['Odalys Venn', ['Hangar_Query_1'], 2.9, 430],
  ['Quillon Aster', [], 18, 410],
  ['Ravenna Skye', [], 1.4, 400],
  ['Stellan Hode', [], 7.5, 380],
  ['Thessaly Crane', ['Contract_Manager'], 0.5, 360],
  ['Ulric Maddox', [], 44, 340],
  ['Vesper Lorne', [], 3.8, 330],
  ['Wystan Pryce', [], 0.8, 310],
  ['Xanthe Rowle', [], 27, 300],
  ['Yorick Dane', [], 62, 290],
  ['Zephyr Ashgrove', [], 1.9, 270],
  ['Aurelio Maks', [], 4.4, 260],
  ['Brynja Tolland', [], 9.1, 250],
  ['Casimir Vael', [], 0.6, 240],
  ['Delphine Ruan', [], 133, 230],
  ['Emric Sol', [], 2.2, 220],
  ['Fenwick Aldous', [], 14, 210],
  ['Gwyneth Ladd', [], 6.3, 190],
  ['Hartwin Oake', [], 82, 180],
  ['Ilse Karrow', [], 1.0, 160],
  ['Jasper Wynn', [], 21, 140],
  ['Lorcan Byre', [], 3.1, 120],
  ['Mirelle Tane', [], 38, 90],
  ['Perrin Oswin', [], 0.4, 60],
];
const SHIPS = [24698, 22544, 17476, 587, 638, 28606, 16240];
export const MEMBERS: Member[] = [
  { id: OFFICER_ID, name: 'Arden Kessil', roles: ['Director', 'Station_Manager', 'Accountant'], silentDays: 0.1, joinedDaysAgo: 380, ship: 28606, title: 1 },
  { id: 90_000_011, name: 'Mira Voskane', roles: ['Factory_Manager', 'Hangar_Take_1'], silentDays: 0.2, joinedDaysAgo: 340, ship: 17476, title: 2 },
  { id: 90_000_012, name: 'Tobin Raske', roles: ['Hangar_Take_1', 'Hangar_Query_1'], silentDays: 0.3, joinedDaysAgo: 300, ship: 28606, title: 4 },
  ...NAMES.map(([name, roles, silentDays, joinedDaysAgo], i): Member => ({
    id: 95_200_001 + i,
    name,
    roles,
    silentDays,
    joinedDaysAgo,
    ship: SHIPS[i % SHIPS.length],
    title: roles.includes('Director') ? 1 : i % 3 === 0 ? 4 : 2,
  })),
];
export const CEO = MEMBERS.find((m) => m.name === 'Halvard Reeve')!;
export const memberByName = (name: string) => MEMBERS.find((m) => m.name === name)!;

/** Corp and other names for /universe/names. */
export const EXTRA_NAMES = new Map<number, { name: string; category: string }>([
  [CORP_ID, { name: 'Halcyon Forge Industries', category: 'corporation' }],
  [98_000_002, { name: 'Lantern Freight Cooperative', category: 'corporation' }],
  [92_000_001, { name: 'Hedion Haulers', category: 'corporation' }],
  [92_000_002, { name: 'Sebiestor Salvage', category: 'corporation' }],
  [92_000_003, { name: 'Pator Mining Co', category: 'corporation' }],
  [93_100_001, { name: 'Blackwater Reavers', category: 'corporation' }],
  [93_100_002, { name: 'Nyx Brigade', category: 'alliance' }],
]);

export interface Structure {
  id: number;
  name: string;
  typeId: number;
  systemId: number;
  fuelDays: number | null;
  state: string;
  timerHours?: number;
  services: [string, 'online' | 'offline'][];
  refinery: boolean;
  moonId?: number;
  moonName?: string;
}
const NOUR = 30001376, TUNT = 30001379, SARE = 30001377;
export const STRUCTURES: Structure[] = [
  { id: 1_040_000_000_001, name: 'Nourvukaiken - Halcyon Forge Athanor', typeId: 35835, systemId: NOUR, fuelDays: 9.4, state: 'shield_vulnerable', services: [['Moon Drilling', 'online'], ['Reprocessing', 'online']], refinery: true, moonId: 40_139_001, moonName: 'Nourvukaiken IV - Moon 2' },
  { id: 1_040_000_000_002, name: 'Tunttaras - Lantern Drill Tatara', typeId: 35836, systemId: TUNT, fuelDays: 3.2, state: 'shield_vulnerable', services: [['Moon Drilling', 'online'], ['Reprocessing', 'online'], ['Reactions', 'offline']], refinery: true, moonId: 40_139_002, moonName: 'Tunttaras VII - Moon 5' },
  { id: 1_040_000_000_003, name: 'Sarekuwa - Ember Reach Athanor', typeId: 35835, systemId: SARE, fuelDays: 18.6, state: 'shield_vulnerable', services: [['Moon Drilling', 'online'], ['Reprocessing', 'online']], refinery: true, moonId: 40_139_003, moonName: 'Sarekuwa II - Moon 1' },
  { id: 1_040_000_000_004, name: 'Nourvukaiken - Forge Quarter Tatara', typeId: 35836, systemId: NOUR, fuelDays: 26.0, state: 'shield_vulnerable', services: [['Moon Drilling', 'online'], ['Reprocessing', 'online']], refinery: true, moonId: 40_139_004, moonName: 'Nourvukaiken VI - Moon 9' },
  { id: 1_040_000_000_005, name: 'Tunttaras - Halcyon Forge Athanor', typeId: 35835, systemId: TUNT, fuelDays: 12.1, state: 'armor_reinforce', timerHours: 41, services: [['Moon Drilling', 'online'], ['Reprocessing', 'online']], refinery: true, moonId: 40_139_005, moonName: 'Tunttaras III - Moon 4' },
  { id: 1_040_000_000_006, name: 'Sarekuwa - Cinder Vault Athanor', typeId: 35835, systemId: SARE, fuelDays: 6.8, state: 'shield_vulnerable', services: [['Moon Drilling', 'online'], ['Reprocessing', 'online']], refinery: true, moonId: 40_139_006, moonName: 'Sarekuwa V - Moon 7' },
  { id: 1_040_000_000_101, name: 'Nourvukaiken - Halcyon Forge Fortizar', typeId: 35833, systemId: NOUR, fuelDays: 21.3, state: 'shield_vulnerable', services: [['Market', 'online'], ['Manufacturing (Standard)', 'online'], ['Reprocessing', 'online'], ['Cloning', 'online']], refinery: false },
  { id: 1_040_000_000_102, name: 'Tunttaras - Forge Works Raitaru', typeId: 35825, systemId: TUNT, fuelDays: 14.7, state: 'shield_vulnerable', services: [['Manufacturing (Standard)', 'online'], ['Blueprint Copying', 'online'], ['Research', 'offline']], refinery: false },
];
export const SYSTEM_IDS = { NOUR, TUNT, SARE };
export const DAY = D;
export const HOUR = H;
