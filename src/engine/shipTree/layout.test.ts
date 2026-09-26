import { describe, expect, it } from 'vitest';
import type { ShipTreeData, ShipTreeShip } from '@/sde/types';
import {
  FACTION_IDS,
  GROUPS,
  alphaMaxLevel,
  hullCounts,
  skillName,
} from './__fixtures__/classData';
import { SHIP_TREE_GEOMETRY as G, hullCountsFor, hullsByClass, layoutShipTree } from './layout';
import { EMPIRE_FACTION_IDS, ORE_FACTION_ID, treeFor } from './templates';
import { classNeedsOmega, parentEmpires } from './rules';
import type { Point, ShipTreeLayout, ShipTreeNode } from './types';

const CALDARI = 500001;
const GALLENTE = 500004;
const CONCORD = 500006;
const GURISTAS = 500010;
const ORE = ORE_FACTION_ID;
const EDENCOM = 500027;

// Class ids (shipTreeGroups).
const CORVETTE = 4;
const FRIGATE = 8;
const NAVY_FRIGATE = 9;
const INTERCEPTOR = 10;
const DREADNOUGHT = 32;
const CARRIER = 33;
const TITAN = 34;
const COMMAND_CARRIER = 2113;
const FREIGHTER = 37;
const ORE_HAULER = 44;
const CAPITAL_INDUSTRIAL = 46;

function layoutFor(factionID: number): ShipTreeLayout {
  const counts = hullCounts(factionID);
  return layoutShipTree({
    factionID,
    defs: treeFor(factionID, new Set(counts.keys())),
    hullCounts: counts,
    needsOmega: (id) => classNeedsOmega(GROUPS.get(id), factionID, alphaMaxLevel),
    parentEmpires: (id) => parentEmpires(GROUPS.get(id), factionID, skillName),
  });
}

function node(layout: ShipTreeLayout, id: number): ShipTreeNode {
  const n = layout.nodes.find((x) => x.def.id === id);
  if (!n) throw new Error(`class ${id} not placed`);
  return n;
}

type Cmd = { c: 'M' | 'H' | 'V' | 'L'; x: number; y: number };

/** An absolute M/H/V/L path as the pen positions after each command. */
function parse(d: string): Cmd[] {
  const t = d.trim().split(/\s+/);
  const out: Cmd[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < t.length;) {
    const c = t[i++] as Cmd['c'];
    if (c === 'M' || c === 'L') {
      x = Number(t[i++]);
      y = Number(t[i++]);
    } else if (c === 'H') x = Number(t[i++]);
    else if (c === 'V') y = Number(t[i++]);
    else throw new Error(`unexpected path token ${String(c)} in ${d}`);
    out.push({ c, x, y });
  }
  return out;
}

function edgeFor(layout: ShipTreeLayout, childId: number): Cmd[] {
  const e = layout.edges.find((x) => x.childId === childId);
  if (!e) throw new Error(`no edge into ${childId}`);
  return parse(e.d);
}

const onSegment = (p: Point, a: Cmd, b: Cmd) => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const within =
    p.x >= Math.min(a.x, b.x) - 0.5 &&
    p.x <= Math.max(a.x, b.x) + 0.5 &&
    p.y >= Math.min(a.y, b.y) - 0.5 &&
    p.y <= Math.max(a.y, b.y) + 0.5;
  return within && Math.abs(cross) < 0.5 * Math.hypot(b.x - a.x, b.y - a.y) + 1e-9;
};

/**
 * The class whose connector an Ω sits on. Stacked children share their
 * trunk, so of the edges through the Ω the one ending nearest to it wins.
 */
function omegaClass(layout: ShipTreeLayout, o: Point): number {
  let best: { id: number; dist: number } | null = null;
  for (const e of layout.edges) {
    const cmds = parse(e.d);
    const hit = cmds.some((c, i) => i > 0 && onSegment(o, cmds[i - 1]!, c));
    if (!hit) continue;
    const end = cmds[cmds.length - 1]!;
    const dist = Math.hypot(end.x - o.x, end.y - o.y);
    if (!best || dist < best.dist) best = { id: e.childId, dist };
  }
  if (!best) throw new Error(`Ω at ${o.x},${o.y} is on no edge`);
  return best.id;
}

const omegaClasses = (layout: ShipTreeLayout) =>
  layout.omegas.map((o) => omegaClass(layout, o)).sort((a, b) => a - b);

describe('SHIP_TREE_GEOMETRY', () => {
  it('matches the in-game 96px tile close-up', () => {
    expect(G).toEqual({
      TILE: 96,
      GAP: 3,
      ICON: 40,
      PAD_L: 46,
      ANCHOR: 20,
      LABEL_H: 24,
      STACK_GAP: 79,
      OMEGA_GAP: 50,
      STEP_X: 100,
      CAP_STEP: 70,
      COL_GAP: 96,
      CHAMFER: 30,
      MARGIN: 110,
    });
  });
});

describe('Ω placement (real class data)', () => {
  it('Caldari: each hull trunk between Navy and first T2, before the Dread, Freighter and Transport Ship', () => {
    const layout = layoutFor(CALDARI);
    // Interceptor, Command Destroyer, Recon, Command Ship, Marauder,
    // Dreadnought (main line), Freighter (industry), Transport Ship.
    expect(omegaClasses(layout)).toEqual([10, 18, 24, 28, 32, 37, 40, 93].sort((a, b) => a - b));
  });

  it('Caldari: trunk Ωs sit between the Navy class and the first T2 class', () => {
    const layout = layoutFor(CALDARI);
    for (const [parent, navy, t2] of [
      [8, 9, 10],
      [14, 2101, 93],
      [16, 17, 18],
      [23, 25, 24],
      [26, 47, 28],
    ] as const) {
      const p = node(layout, parent);
      const n = node(layout, navy);
      const t = node(layout, t2);
      const o = layout.omegas.find((w) => w.x === p.x + G.ANCHOR && w.y < p.y);
      expect(o, `Ω on class ${parent}'s trunk`).toBeDefined();
      expect(o!.y).toBeLessThan(n.y - G.LABEL_H);
      expect(o!.y).toBeGreaterThan(t.y + t.h);
    }
  });

  it('Caldari: none on the capital trunk — the main-line Ω before the Dread covers it', () => {
    const layout = layoutFor(CALDARI);
    const dread = node(layout, DREADNOUGHT);
    const bs = node(layout, 26);
    const onMain = layout.omegas.filter((o) => o.y === dread.y + G.ANCHOR);
    expect(onMain).toHaveLength(1);
    expect(onMain[0]!.x).toBeGreaterThan(bs.x + bs.w);
    expect(onMain[0]!.x).toBeLessThan(dread.x - 60);
    expect(layout.omegas.filter((o) => o.x === dread.x - 60)).toEqual([]);
  });

  it('ORE: before the Mining Barge, on the Expedition Frigate and Mining Command Destroyer trunks, on the hauler drop', () => {
    // Mining Barge, Expedition Frigate, ORE Hauler, Mining Command Destroyer —
    // none before Industrial Command Ship, Capital Industrial Ship or Freighter.
    expect(omegaClasses(layoutFor(ORE))).toEqual([42, 44, 48, 2112]);
  });

  it('CONCORD: exactly one, between Shuttle and Covert Ops', () => {
    const layout = layoutFor(CONCORD);
    expect(omegaClasses(layout)).toEqual([12]);
    const shuttle = node(layout, 35);
    const covops = node(layout, 12);
    const [o] = layout.omegas;
    expect(o!.x).toBeGreaterThan(shuttle.x + shuttle.w);
    expect(o!.x).toBeLessThan(covops.x);
  });

  it('EDENCOM: exactly one, on the root line ahead of the industry fork', () => {
    const layout = layoutFor(EDENCOM);
    expect(omegaClasses(layout)).toEqual([FRIGATE]);
    const fork = edgeFor(layout, 36)[0]!;
    const [o] = layout.omegas;
    expect(o!.y).toBe(fork.y);
    expect(o!.x).toBeLessThan(fork.x);
    expect(o!.x).toBeGreaterThan(layout.root.x);
  });

  it('Guristas: exactly one, before the Dreadnought', () => {
    expect(omegaClasses(layoutFor(GURISTAS))).toEqual([DREADNOUGHT]);
  });
});

describe('structure (real class data)', () => {
  it.each(FACTION_IDS)('faction %i: every class hangs off the template — no strays', (id) => {
    const layout = layoutFor(id);
    expect(layout.nodes).toHaveLength(hullCounts(id).size);
    for (const n of layout.nodes) {
      expect(
        layout.edges.some((e) => e.childId === n.def.id),
        `class ${n.def.id}`
      ).toBe(true);
    }
  });

  it.each(FACTION_IDS)('faction %i: everything lies within [0,width]×[0,height]', (id) => {
    const layout = layoutFor(id);
    const inside = (p: Point, what: string) => {
      expect(p.x, what).toBeGreaterThanOrEqual(0);
      expect(p.y, what).toBeGreaterThanOrEqual(0);
      expect(p.x, what).toBeLessThanOrEqual(layout.width);
      expect(p.y, what).toBeLessThanOrEqual(layout.height);
    };
    for (const n of layout.nodes) {
      inside({ x: n.x, y: n.y - G.LABEL_H }, `class ${n.def.id} top-left`);
      inside({ x: n.x + n.w, y: n.y + n.h }, `class ${n.def.id} bottom-right`);
    }
    for (const e of layout.edges) for (const c of parse(e.d)) inside(c, `edge ${e.key}`);
    for (const o of layout.omegas) inside(o, 'Ω');
    for (const e of layout.emblems) {
      inside(e, `emblem ${e.factionID}`);
      inside(e.from, `emblem ${e.factionID} line`);
    }
    inside(layout.root, 'root');
    // MARGIN of room on the left and top.
    const minX = Math.min(layout.root.x, ...layout.nodes.map((n) => n.x));
    expect(minX).toBe(G.MARGIN);
  });

  it('empire: the Corvette sits on its own row below the main line', () => {
    const layout = layoutFor(CALDARI);
    const corvette = node(layout, CORVETTE);
    const frigate = node(layout, FRIGATE);
    expect(corvette.y - frigate.y).toBe(200);
    expect(frigate.x).toBe(corvette.x + corvette.w + 164);
    expect(layout.root).toEqual({ x: corvette.x - 175, y: corvette.y + G.ANCHOR });
  });

  it('empire: Navy Frigate directly above the Frigate, Interceptor stepped right', () => {
    const layout = layoutFor(CALDARI);
    const frigate = node(layout, FRIGATE);
    const navy = node(layout, NAVY_FRIGATE);
    const inty = node(layout, INTERCEPTOR);
    expect(navy.x).toBe(frigate.x);
    expect(navy.y + navy.h).toBe(frigate.y - G.STACK_GAP);
    expect(inty.x).toBe(frigate.x + G.STEP_X);
    expect(inty.y).toBeLessThan(navy.y);
  });

  it('empire: Carrier, Command Carrier, Titan climb the capital trunk above the Dread stack', () => {
    const layout = layoutFor(CALDARI);
    const dread = node(layout, DREADNOUGHT);
    const carrier = node(layout, CARRIER);
    const cc = node(layout, COMMAND_CARRIER);
    const titan = node(layout, TITAN);
    const trunkX = dread.x - 60;
    for (const c of [carrier, cc, titan]) expect(c.x).toBe(trunkX + G.CAP_STEP);
    expect(carrier.y).toBeGreaterThan(cc.y);
    expect(cc.y).toBeGreaterThan(titan.y);
    const dreadStackTop = Math.min(node(layout, 2102).y, node(layout, 2104).y);
    expect(carrier.y + carrier.h).toBeLessThan(dreadStackTop);
  });

  it('empire: the Shuttle starts the industry line under the Corvette', () => {
    const layout = layoutFor(CALDARI);
    const corvette = node(layout, CORVETTE);
    const shuttle = node(layout, 35);
    expect(shuttle.x).toBe(corvette.x + 204);
    expect(shuttle.y - node(layout, FRIGATE).y).toBeGreaterThanOrEqual(498);
  });

  it('ORE: the Freighter drops to a row below the hauler line, under the Capital Industrial Ship', () => {
    const layout = layoutFor(ORE);
    const hauler = node(layout, ORE_HAULER);
    const rorqual = node(layout, CAPITAL_INDUSTRIAL);
    const bowhead = node(layout, FREIGHTER);
    expect(bowhead.x).toBe(rorqual.x);
    expect(bowhead.y - hauler.y).toBe(278);
    expect(rorqual.y).toBe(hauler.y);
    expect(edgeFor(layout, FREIGHTER)).toEqual([
      { c: 'M', x: hauler.x + G.ANCHOR, y: hauler.y + G.ICON },
      { c: 'V', x: hauler.x + G.ANCHOR, y: bowhead.y + G.ANCHOR },
      { c: 'H', x: bowhead.x, y: bowhead.y + G.ANCHOR },
    ]);
  });
});

describe('edge shapes', () => {
  it('a stepped branch rises from the parent icon centre and bends 45° into the child', () => {
    const layout = layoutFor(CALDARI);
    const frigate = node(layout, FRIGATE);
    const inty = node(layout, INTERCEPTOR);
    const [m, v, l, ...rest] = edgeFor(layout, INTERCEPTOR);
    expect(rest).toEqual([]);
    expect(m).toEqual({ c: 'M', x: frigate.x + G.ANCHOR, y: frigate.y + G.ANCHOR });
    expect(v!.c).toBe('V');
    expect(l).toEqual({ c: 'L', x: inty.x, y: inty.y + G.ANCHOR });
    const dx = l!.x - v!.x;
    const dy = v!.y - l!.y;
    expect(dx).toBe(G.STEP_X - G.ANCHOR);
    expect(Math.abs(dx)).toBe(Math.abs(dy));
  });

  it('a Navy branch is a pure vertical', () => {
    const layout = layoutFor(CALDARI);
    const frigate = node(layout, FRIGATE);
    const navy = node(layout, NAVY_FRIGATE);
    expect(edgeFor(layout, NAVY_FRIGATE)).toEqual([
      { c: 'M', x: frigate.x + G.ANCHOR, y: frigate.y + G.ANCHOR },
      { c: 'V', x: frigate.x + G.ANCHOR, y: navy.y + G.ANCHOR },
    ]);
  });

  it('a capital branch leaves its trunk and bends 45° CAP_STEP right', () => {
    const layout = layoutFor(CALDARI);
    const [m, v, l] = edgeFor(layout, TITAN);
    expect(m!.x).toBe(node(layout, DREADNOUGHT).x - 60);
    expect(l!.x - v!.x).toBe(G.CAP_STEP);
    expect(v!.y - l!.y).toBe(G.CAP_STEP);
  });

  it('Corvette → Frigate runs right, 45° up, then vertically into the Frigate icon bottom', () => {
    const layout = layoutFor(CALDARI);
    const corvette = node(layout, CORVETTE);
    const frigate = node(layout, FRIGATE);
    const cmds = edgeFor(layout, FRIGATE);
    expect(cmds.map((c) => c.c)).toEqual(['M', 'H', 'L', 'V']);
    expect(cmds[0]).toEqual({ c: 'M', x: corvette.x + corvette.w, y: corvette.y + G.ANCHOR });
    const [, h, l, v] = cmds;
    expect(l!.x - h!.x).toBe(G.CHAMFER);
    expect(h!.y - l!.y).toBe(G.CHAMFER);
    expect(v).toEqual({ c: 'V', x: frigate.x + G.ANCHOR, y: frigate.y + G.ICON });
  });

  it('the main line joins class icons horizontally', () => {
    const layout = layoutFor(CALDARI);
    const frigate = node(layout, FRIGATE);
    const destroyer = node(layout, 14);
    expect(edgeFor(layout, 14)).toEqual([
      { c: 'M', x: frigate.x + frigate.w, y: frigate.y + G.ANCHOR },
      { c: 'H', x: destroyer.x, y: frigate.y + G.ANCHOR },
    ]);
  });
});

describe('pirate emblems', () => {
  it('Guristas: Caldari above and Gallente below each main class, no top where it has kids', () => {
    const layout = layoutFor(GURISTAS);
    const mains = layout.nodes.filter((n) => n.def.lane === 'main');
    expect(mains.map((n) => n.def.id)).toEqual([8, 14, 16, 23, 26, 32]);
    for (const n of mains) {
      const from = { x: n.x + G.ANCHOR, y: n.y + G.ANCHOR };
      const mine = layout.emblems.filter((e) => e.from.x === from.x);
      const bottom = mine.find((e) => e.factionID === GALLENTE);
      expect(bottom).toEqual({ factionID: GALLENTE, x: from.x, y: n.y + n.h + 70, from });
      const top = mine.find((e) => e.factionID === CALDARI);
      if (n.def.id === DREADNOUGHT) expect(top).toBeUndefined();
      else expect(top).toEqual({ factionID: CALDARI, x: from.x, y: n.y - 126, from });
    }
    expect(layout.emblems).toHaveLength(11);
  });

  it('empires and ORE have none', () => {
    for (const id of [...EMPIRE_FACTION_IDS, ORE]) expect(layoutFor(id).emblems).toEqual([]);
  });
});

describe('layoutShipTree edge cases', () => {
  it('lays out an empty tree without throwing', () => {
    const layout = layoutShipTree({
      factionID: CALDARI,
      defs: [],
      hullCounts: new Map(),
      needsOmega: () => false,
      parentEmpires: () => [],
    });
    expect(layout.nodes).toEqual([]);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
  });

  it('parks a class the template does not place in a stray row', () => {
    const layout = layoutShipTree({
      factionID: CALDARI,
      defs: [
        { id: FRIGATE, parent: null, lane: 'main' },
        { id: 9999, parent: null, lane: 'branch' },
      ],
      hullCounts: new Map([
        [FRIGATE, 1],
        [9999, 1],
      ]),
      needsOmega: () => false,
      parentEmpires: () => [],
    });
    const stray = node(layout, 9999);
    const frigate = node(layout, FRIGATE);
    expect(stray.y).toBe(frigate.y + frigate.h + 200);
  });

  it('sizes a class by its hull count: up to 3 columns', () => {
    const layout = layoutFor(CALDARI);
    const frigate = node(layout, FRIGATE); // 6 hulls
    expect(frigate.cols).toBe(3);
    expect(frigate.w).toBe(G.PAD_L + 3 * G.TILE + 2 * G.GAP);
    expect(frigate.h).toBe(2 * (G.TILE + G.GAP) - G.GAP);
    expect(node(layout, 14).cols).toBe(2);
  });
});

function hull(typeID: number, name: string, factionID: number, treeGroupID: number): ShipTreeShip {
  return {
    typeID,
    name,
    factionID,
    treeGroupID,
    techLevel: 1,
    metaLevel: 0,
    required: [],
    traits: [],
    stats: {
      highSlots: 0,
      medSlots: 0,
      lowSlots: 0,
      rigSlots: 0,
      rigSize: 0,
      turretHardpoints: 0,
      launcherHardpoints: 0,
      cpu: 0,
      powergrid: 0,
      calibration: 0,
      droneBay: 0,
      droneBandwidth: 0,
    },
    description: '',
  };
}

describe('hull helpers', () => {
  const data: ShipTreeData = {
    factions: [],
    groups: {},
    ships: [
      hull(1, 'Merlin', CALDARI, 8),
      hull(2, 'Bantam', CALDARI, 8),
      hull(3, 'Caracal', CALDARI, 16),
      hull(4, 'Tristan', GALLENTE, 8),
    ],
  };

  it('counts a faction’s hulls per class', () => {
    expect(hullCountsFor(data, CALDARI)).toEqual(
      new Map([
        [8, 2],
        [16, 1],
      ])
    );
  });

  it('groups a faction’s hulls per class, sorted by name', () => {
    const by = hullsByClass(data, CALDARI);
    expect(by.get(8)?.map((s) => s.name)).toEqual(['Bantam', 'Merlin']);
    expect(by.get(16)?.map((s) => s.name)).toEqual(['Caracal']);
    expect(by.has(4)).toBe(false);
  });
});
