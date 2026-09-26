/**
 * Ship Tree geometry, matched 1:1 to an in-game ISIS 96px-tile close-up.
 *
 * The main hull line runs left to right from a capsule root. Each class is a
 * 40px class icon (skill blocks under it) and 96px hull tiles. A size's
 * specialised classes stack straight up; lines leave the parent's class icon
 * vertically and take one 45° bend into the child's icon. Capitals get a
 * second trunk off the main line just left of the Dreadnought. The
 * industrial line runs underneath. A gold Ω sits on the line wherever the
 * next class needs an Omega clone.
 *
 * Everything is laid out around the root first, then offset once so the
 * whole tree lands in [0, width] × [0, height]; edge paths, Ωs and emblems
 * come out already in that final space.
 */
import type { ShipTreeData, ShipTreeShip } from '@/sde/types';
import { CORVETTE_CLASS_ID, DREADNOUGHT_CLASS_ID, STACKED_CLASSES } from './templates';
import type {
  Point,
  ShipTreeEdge,
  ShipTreeEmblem,
  ShipTreeLane,
  ShipTreeLayout,
  ShipTreeLayoutInput,
  ShipTreeNode,
  ShipTreeNodeDef,
  ShipTreeOmega,
} from './types';

export const SHIP_TREE_GEOMETRY = {
  TILE: 96,
  GAP: 3,
  ICON: 40,
  /** Icon column + gutter before the first tile. */
  PAD_L: 46,
  /** Line anchor: centre of the class icon. */
  ANCHOR: 20,
  LABEL_H: 24,
  /** Tile-bottom to parent-tile-top between stacked classes. */
  STACK_GAP: 79,
  /** Extra room when an Ω sits on the trunk between two rows. */
  OMEGA_GAP: 50,
  STEP_X: 100,
  CAP_STEP: 70,
  COL_GAP: 96,
  CHAMFER: 30,
  MARGIN: 110,
  /** Most tile columns a class gets. */
  MAX_COLS: 3,
  /** Capsule icon width; the root line leaves its right edge. */
  CAPSULE_W: 28,
  /** Root line to the first main class when there is no Corvette. */
  ROOT_LINE: 140,
  /** Extra root line for an Ω on it, and for the industry fork off it. */
  ROOT_OMEGA_W: 90,
  ROOT_FORK_W: 110,
  /** Capsule edge to the industry fork (and the root Ω). */
  ROOT_FORK_X: 70,
  /** The Corvette's row below the main line, and the capsule's lead in front of it. */
  CORVETTE_Y: 200,
  CORVETTE_ROOT_X: 175,
  /** Corvette's right edge to the first main class. */
  CORVETTE_TO_MAIN: 164,
  /** Main line to the capital trunk's junction. */
  CAP_JUNCTION: 60,
  /** Pirate emblems: above the class, below its tiles, and half their size. */
  EMBLEM_ABOVE: 126,
  EMBLEM_BELOW: 70,
  EMBLEM_HALF: 20,
  /** A trunk Ω's clearance below the label it sits under. */
  OMEGA_LABEL_CLEAR: 8,
  /** The industry line's lowest y (with / without a Corvette) and its gap under the main line. */
  INDUSTRY_Y_CORVETTE: 498,
  INDUSTRY_Y: 280,
  INDUSTRY_GAP: 60,
  /** Industry x: the Shuttle off the Corvette; else off the first main class, then per step. */
  SHUTTLE_X: 204,
  INDUSTRY_X: 250,
  INDUSTRY_STEP: 150,
  /** The drop row below the industry line, and its Ω's rise above the drop. */
  DROP_Y: 278,
  DROP_OMEGA_RISE: 40,
  /** Unplaced classes' row below everything else. */
  STRAY_GAP: 200,
} as const;

const {
  TILE,
  GAP,
  ICON,
  PAD_L,
  ANCHOR,
  LABEL_H,
  STACK_GAP,
  OMEGA_GAP,
  STEP_X,
  CAP_STEP,
  COL_GAP,
  CHAMFER,
  MARGIN,
  MAX_COLS,
  CAPSULE_W,
  ROOT_LINE,
  ROOT_OMEGA_W,
  ROOT_FORK_W,
  ROOT_FORK_X,
  CORVETTE_Y,
  CORVETTE_ROOT_X,
  CORVETTE_TO_MAIN,
  CAP_JUNCTION,
  EMBLEM_ABOVE,
  EMBLEM_BELOW,
  EMBLEM_HALF,
  OMEGA_LABEL_CLEAR,
  INDUSTRY_Y_CORVETTE,
  INDUSTRY_Y,
  INDUSTRY_GAP,
  SHUTTLE_X,
  INDUSTRY_X,
  INDUSTRY_STEP,
  DROP_Y,
  DROP_OMEGA_RISE,
  STRAY_GAP,
} = SHIP_TREE_GEOMETRY;

/** One absolute path command; kept as numbers so the final offset is one pass. */
type Seg = { c: 'M' | 'L'; x: number; y: number } | { c: 'H'; x: number } | { c: 'V'; y: number };

const M = (x: number, y: number): Seg => ({ c: 'M', x, y });
const L = (x: number, y: number): Seg => ({ c: 'L', x, y });
const H = (x: number): Seg => ({ c: 'H', x });
const V = (y: number): Seg => ({ c: 'V', y });

function pathD(segs: readonly Seg[], ox: number, oy: number): string {
  return segs
    .map((s) =>
      s.c === 'H'
        ? `H ${s.x + ox}`
        : s.c === 'V'
          ? `V ${s.y + oy}`
          : `${s.c} ${s.x + ox} ${s.y + oy}`
    )
    .join(' ');
}

interface RawEdge {
  key: string;
  childId: number;
  segs: Seg[];
}

function sized(count: number) {
  const cols = Math.max(1, Math.min(MAX_COLS, count));
  const rows = Math.ceil(Math.max(1, count) / cols);
  return { cols, w: PAD_L + cols * TILE + (cols - 1) * GAP, h: rows * (TILE + GAP) - GAP };
}

export function layoutShipTree(input: ShipTreeLayoutInput): ShipTreeLayout {
  const { defs, hullCounts } = input;
  const omega = input.needsOmega;
  const nodes: ShipTreeNode[] = [];
  const edges: RawEdge[] = [];
  const omegas: ShipTreeOmega[] = [];
  const emblems: ShipTreeEmblem[] = [];
  const size = (d: ShipTreeNodeDef) => sized(hullCounts.get(d.id) ?? 0);
  const place = (def: ShipTreeNodeDef, x: number, y: number) => {
    const n: ShipTreeNode = { def, x, y, ...size(def) };
    nodes.push(n);
    return n;
  };
  const kids = (id: number, lane: ShipTreeLane) =>
    defs.filter((d) => d.parent === id && d.lane === lane);
  const right = (n: ShipTreeNode) => n.x + n.w;
  const edge = (childId: number, ...segs: Seg[]) =>
    edges.push({ key: `${childId}-${edges.length}`, childId, segs });

  /**
   * Stack classes upward off a vertical trunk at `trunkX` (default: the
   * parent's icon centre), starting above `startY`. Returns right reach and
   * the top row's y.
   */
  function stack(
    parent: ShipTreeNode,
    children: readonly ShipTreeNodeDef[],
    startY: number,
    capital?: { trunkX: number; covered: boolean }
  ) {
    let prevTop = startY;
    let omegaSeen = omega(parent.def.id) || (capital?.covered ?? false);
    let reach = right(parent);
    const sx = capital?.trunkX ?? parent.x + ANCHOR;
    const sy = parent.y + ANCHOR;
    children.forEach((def, i) => {
      const s = size(def);
      const needsOmega = omega(def.id) && !omegaSeen;
      const y = prevTop - STACK_GAP - (needsOmega ? OMEGA_GAP : 0) - s.h;
      const x = capital
        ? capital.trunkX + CAP_STEP
        : i === 0 && STACKED_CLASSES.has(def.id)
          ? parent.x
          : parent.x + STEP_X;
      const n = place(def, x, y);
      const ey = y + ANCHOR;
      const dd = x - sx < 1 ? 0 : x - sx;
      if (dd === 0) edge(def.id, M(sx, sy), V(ey));
      else edge(def.id, M(sx, sy), V(ey + dd), L(x, ey));
      if (needsOmega) {
        const lower = prevTop - LABEL_H - OMEGA_LABEL_CLEAR;
        const upper = dd === 0 ? y + s.h : ey + dd;
        omegas.push({ x: sx, y: (lower + upper) / 2, classId: def.id });
        omegaSeen = true;
      }
      reach = Math.max(reach, right(n));
      prevTop = y;
    });
    return { reach, topY: prevTop };
  }

  const corvetteDef = defs.find((d) => d.id === CORVETTE_CLASS_ID && d.lane === 'main');
  const mainDefs = defs.filter((d) => d.lane === 'main' && d !== corvetteDef);
  const industryDefs = defs.filter((d) => d.lane === 'industry');
  const firstMain = mainDefs[0];
  const rootOmega = !!firstMain && omega(firstMain.id) && !corvetteDef;
  const forkFromRoot = !corvetteDef && industryDefs.length > 0;

  // Root capsule and the start of the main line.
  let root: Point;
  let corvette: ShipTreeNode | null = null;
  let x: number;
  if (corvetteDef) {
    corvette = place(corvetteDef, 0, CORVETTE_Y);
    root = { x: -CORVETTE_ROOT_X, y: corvette.y + ANCHOR };
    edge(CORVETTE_CLASS_ID, M(root.x + CAPSULE_W, root.y), H(corvette.x));
    x = right(corvette) + CORVETTE_TO_MAIN;
  } else {
    root = { x: 0, y: ANCHOR };
    x =
      root.x +
      CAPSULE_W +
      ROOT_LINE +
      (rootOmega ? ROOT_OMEGA_W : 0) +
      (forkFromRoot ? ROOT_FORK_W : 0);
  }
  const forkX = root.x + CAPSULE_W + ROOT_FORK_X + (rootOmega ? ROOT_OMEGA_W : 0);
  if (rootOmega && firstMain) {
    omegas.push({ x: root.x + CAPSULE_W + ROOT_FORK_X, y: ANCHOR, classId: firstMain.id });
  }

  const mains: ShipTreeNode[] = [];
  let branchTop = 0;
  for (const def of mainDefs) {
    const n = place(def, x, 0);
    const prev = mains[mains.length - 1];
    const capitals = kids(def.id, 'capital');
    const leftJunction = capitals.length > 0 && !!prev && def.id === DREADNOUGHT_CLASS_ID;
    const junctionX = leftJunction ? n.x - CAP_JUNCTION : right(n) + CAP_JUNCTION;
    if (prev) {
      edge(def.id, M(right(prev), ANCHOR), H(n.x));
      if (omega(def.id) && !omega(prev.def.id)) {
        const end = leftJunction ? junctionX : n.x;
        omegas.push({ x: (right(prev) + end) / 2, y: ANCHOR, classId: def.id });
      }
    } else if (corvette) {
      const fx = n.x + ANCHOR;
      const cy = corvette.y + ANCHOR;
      edge(def.id, M(right(corvette), cy), H(fx - CHAMFER), L(fx, cy - CHAMFER), V(n.y + ICON));
    } else {
      edge(def.id, M(root.x + CAPSULE_W, ANCHOR), H(n.x));
    }
    mains.push(n);

    const branches = stack(n, kids(def.id, 'branch'), n.y);
    let reach = branches.reach;
    branchTop = Math.min(branchTop, branches.topY);
    const firstCapital = capitals[0];
    if (firstCapital) {
      if (!leftJunction) edge(firstCapital.id, M(right(n), ANCHOR), H(junctionX));
      const caps = stack(n, capitals, branches.topY, {
        trunkX: junctionX,
        // The main-line Ω before the Dreadnought already covers this trunk.
        covered: leftJunction && omega(def.id),
      });
      reach = Math.max(reach, caps.reach);
      branchTop = Math.min(branchTop, caps.topY);
    }

    // Pirate hulls link up and down to the two empires whose skills they use.
    const [bottom, top] = input.parentEmpires(def.id);
    if (bottom !== undefined && top !== undefined) {
      const from = { x: n.x + ANCHOR, y: n.y + ANCHOR };
      if (kids(def.id, 'branch').length === 0 && capitals.length === 0) {
        emblems.push({ factionID: top, x: from.x, y: n.y - EMBLEM_ABOVE, from });
      }
      emblems.push({ factionID: bottom, x: from.x, y: n.y + n.h + EMBLEM_BELOW, from });
    }
    x = reach + COL_GAP;
  }

  // Industrial line.
  const mainBottom = Math.max(
    corvette ? corvette.y + corvette.h : 0,
    ...mains.map((n) => n.y + n.h),
    ...emblems.map((e) => e.y + EMBLEM_HALF)
  );
  const stackHeight = (d: ShipTreeNodeDef) =>
    kids(d.id, 'branch').reduce((sum, k) => sum + size(k).h + STACK_GAP + OMEGA_GAP, 0);
  const industryY = Math.max(
    corvette ? INDUSTRY_Y_CORVETTE : INDUSTRY_Y,
    mainBottom + INDUSTRY_GAP + Math.max(0, ...industryDefs.map(stackHeight))
  );
  const industry: ShipTreeNode[] = [];
  industryDefs.forEach((def, i) => {
    const prev = industry[industry.length - 1];
    let ix: number;
    if (corvette) {
      ix =
        i === 0
          ? corvette.x + SHUTTLE_X
          : (mains[Math.round((i * (mains.length - 1)) / (industryDefs.length - 1))]?.x ?? 0);
    } else {
      ix = prev ? right(prev) + INDUSTRY_STEP : (mains[0]?.x ?? 0) + INDUSTRY_X;
    }
    const n = place(def, ix, industryY);
    const iy = industryY + ANCHOR;
    if (prev) {
      edge(def.id, M(right(prev), iy), H(n.x));
      if (omega(def.id) && !omega(prev.def.id)) {
        omegas.push({ x: (right(prev) + n.x) / 2, y: iy, classId: def.id });
      }
    } else {
      const fx = corvette ? corvette.x + ANCHOR : forkX;
      const fy = corvette ? corvette.y + ICON : ANCHOR;
      edge(def.id, M(fx, fy), V(iy - CHAMFER), L(fx + CHAMFER, iy), H(n.x));
      const covered = corvette ? omega(CORVETTE_CLASS_ID) : rootOmega;
      if (omega(def.id) && !covered) {
        omegas.push({ x: fx, y: (fy + iy - CHAMFER) / 2, classId: def.id });
      }
    }
    industry.push(n);
    stack(n, kids(def.id, 'branch'), n.y);
    // Drops hang on a third row; x (and the path) is fixed up below once the
    // line's far end is known (ORE: Bowhead under the Rorqual).
    for (const d of kids(def.id, 'drop')) {
      const dn = place(d, ix, industryY + DROP_Y);
      edge(d.id);
      if (omega(d.id) && !omega(def.id)) {
        omegas.push({ x: n.x + ANCHOR, y: dn.y - DROP_OMEGA_RISE, classId: d.id });
      }
    }
  });
  // Drops sit under the last industry column once the line is laid out.
  const lastIndustry = industry[industry.length - 1];
  if (lastIndustry) {
    for (const n of nodes) {
      if (n.def.lane !== 'drop') continue;
      n.x = lastIndustry.x;
      const parent = nodes.find((p) => p.def.id === n.def.parent);
      const e = edges.find((ed) => ed.childId === n.def.id);
      if (parent && e) e.segs = [M(parent.x + ANCHOR, parent.y + ICON), V(n.y + ANCHOR), H(n.x)];
    }
  }

  // Anything the template doesn't place still shows up, bottom-left.
  const placed = new Set(nodes.map((n) => n.def.id));
  let strayX = 0;
  const strayY = Math.max(0, ...nodes.map((n) => n.y + n.h)) + STRAY_GAP;
  for (const def of defs) {
    if (placed.has(def.id)) continue;
    strayX = right(place(def, strayX, strayY)) + COL_GAP;
  }

  const minX = Math.min(root.x, ...nodes.map((n) => n.x));
  const minY = Math.min(
    ...nodes.map((n) => n.y - LABEL_H),
    ...emblems.map((e) => e.y - EMBLEM_HALF),
    branchTop - LABEL_H
  );
  const ox = MARGIN - minX;
  const oy = MARGIN - minY;
  const shift = (p: Point): Point => ({ x: p.x + ox, y: p.y + oy });
  const finalNodes = nodes.map((n) => ({ ...n, x: n.x + ox, y: n.y + oy }));
  const finalEmblems = emblems.map((e) => ({ ...e, ...shift(e), from: shift(e.from) }));
  const finalRoot = shift(root);
  return {
    nodes: finalNodes,
    edges: edges
      .filter((e) => e.segs.length > 0)
      .map((e): ShipTreeEdge => ({ key: e.key, childId: e.childId, d: pathD(e.segs, ox, oy) })),
    omegas: omegas.map((o) => ({ ...o, ...shift(o) })),
    emblems: finalEmblems,
    root: finalRoot,
    width: Math.max(finalRoot.x + CAPSULE_W, ...finalNodes.map(right)) + MARGIN,
    height:
      Math.max(
        finalRoot.y,
        ...finalNodes.map((n) => n.y + n.h),
        ...finalEmblems.map((e) => e.y + EMBLEM_HALF)
      ) + MARGIN,
  };
}

/** Class id -> how many hulls this faction has in it. */
export function hullCountsFor(data: ShipTreeData, factionID: number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const ship of data.ships) {
    if (ship.factionID !== factionID) continue;
    counts.set(ship.treeGroupID, (counts.get(ship.treeGroupID) ?? 0) + 1);
  }
  return counts;
}

/** Class id -> this faction's hulls in it, sorted by name. */
export function hullsByClass(data: ShipTreeData, factionID: number): Map<number, ShipTreeShip[]> {
  const by = new Map<number, ShipTreeShip[]>();
  for (const ship of data.ships) {
    if (ship.factionID !== factionID) continue;
    const list = by.get(ship.treeGroupID) ?? [];
    list.push(ship);
    by.set(ship.treeGroupID, list);
  }
  for (const list of by.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return by;
}
