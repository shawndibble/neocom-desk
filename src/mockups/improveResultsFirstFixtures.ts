/** Sample data for the Improve results-first mockups (#5104). Not the engine: static figures. */

export type GoalGroup =
  'Combat' | 'Mining' | 'Hauling and movement' | 'Logistics' | 'Tackle' | 'EWAR' | 'Command';

export interface MockGoal {
  id: string;
  label: string;
  /** The one-line "scores …" description every goal gets. */
  scores: string;
  group: GoalGroup;
  /** Why the fit cannot score it; absent when it can. Shown inline, never only on hover. */
  reason?: string;
}

/** The 15 goals as `en.json` names them. The fit is a Hurricane with guns and no support modules. */
export const GOALS: readonly MockGoal[] = [
  {
    id: 'overall',
    label: 'Best overall',
    scores: 'Scores damage and tank equally, then speed, align, lock range, reach and capacitor.',
    group: 'Combat',
  },
  {
    id: 'damage',
    label: 'More damage',
    scores: 'Scores sustained damage applied to your Target Profile.',
    group: 'Combat',
  },
  { id: 'tank', label: 'Tankier', scores: 'Scores effective hit points.', group: 'Combat' },
  { id: 'speed', label: 'Faster', scores: 'Scores maximum velocity.', group: 'Combat' },
  {
    id: 'reach',
    label: 'Longer reach',
    scores: 'Scores optimal plus falloff of the guns, or missile range.',
    group: 'Combat',
  },
  {
    id: 'cheaper',
    label: 'Cheaper',
    scores: 'Scores fit price, keeping damage, tank and speed within 5%.',
    group: 'Combat',
  },
  {
    id: 'mining',
    label: 'Mine more',
    scores: 'Scores m³/s for the crystal family you pick.',
    group: 'Mining',
    reason: 'No miners on this fit',
  },
  {
    id: 'haul',
    label: 'Carry more',
    scores: 'Scores the hold you pick, in m³.',
    group: 'Hauling and movement',
  },
  {
    id: 'align',
    label: 'Align faster',
    scores: 'Scores seconds to align.',
    group: 'Hauling and movement',
  },
  {
    id: 'warp',
    label: 'Align and warp faster',
    scores: 'Scores align time and warp speed together.',
    group: 'Hauling and movement',
  },
  {
    id: 'repair',
    label: 'Repair more',
    scores: 'Scores remote repair per second.',
    group: 'Logistics',
    reason: 'No remote repairers on this fit',
  },
  {
    id: 'transfer',
    label: 'Transfer more',
    scores: 'Scores remote capacitor transferred per second.',
    group: 'Logistics',
    reason: 'No remote capacitor transmitters on this fit',
  },
  {
    id: 'tackle',
    label: 'Hold tighter',
    scores: 'Scores scram and disruptor points, web slowdown and range.',
    group: 'Tackle',
    reason: 'No warp scramblers, disruptors or webs on this fit',
  },
  {
    id: 'ewar',
    label: 'Stronger EWAR',
    scores: 'Scores module strength and range, not the effect on a target.',
    group: 'EWAR',
    reason: 'No electronic warfare modules on this fit',
  },
  {
    id: 'command',
    label: 'Stronger fleet support',
    scores: 'Scores burst strength and range, compression range and core fuel.',
    group: 'Command',
    reason: 'No command bursts, compressors or industrial core on this fit',
  },
];

export const GROUP_ORDER: readonly GoalGroup[] = [
  'Combat',
  'Mining',
  'Hauling and movement',
  'Logistics',
  'Tackle',
  'EWAR',
  'Command',
];

export const SHIP = 'Hurricane — 720mm arty';

export interface MockRow {
  id: string;
  swap: string;
  /** Stat changes as `StatChange` takes them. */
  changes: { key: 'sustainedDps' | 'ehp' | 'maxVelocity'; before: number; after: number }[];
  /** Positive: costs ISK. */
  isk: number;
  /** Trade-off rows say what they give up. */
  givesUp?: { key: 'sustainedDps' | 'ehp' | 'maxVelocity'; before: number; after: number };
}

export const NO_DOWNSIDE: readonly MockRow[] = [
  {
    id: 'a',
    swap: '4× 720mm Howitzer Artillery I → II',
    changes: [{ key: 'sustainedDps', before: 90.7, after: 104.9 }],
    isk: 18_400_000,
  },
  {
    id: 'b',
    swap: '1× Medium Armor Repairer I → II',
    changes: [{ key: 'ehp', before: 41_200, after: 43_100 }],
    isk: 2_100_000,
  },
];

export const TRADE_OFFS: readonly MockRow[] = [
  {
    id: 'c',
    swap: '1× 10MN Afterburner II → Damage Control II',
    changes: [{ key: 'ehp', before: 41_200, after: 46_900 }],
    givesUp: { key: 'maxVelocity', before: 1_085, after: 410 },
    isk: 5_600_000,
  },
];

export const NOW_BEST = {
  dps: { now: 90.7, best: 128 },
  ehp: { now: '41.2k', best: '47.0k' },
};
