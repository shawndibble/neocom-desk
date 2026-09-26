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
import { STACKED_CLASSES } from './templates';
import type {
  Point,
  ShipTreeEdge,
  ShipTreeEmblem,
  ShipTreeLane,
  ShipTreeLayout,
  ShipTreeLayoutInput,
  ShipTreeNode,
  ShipTreeNodeDef,
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
} as const;

const {
  TILE,
  GAP,
  ICON,
  PAD_L,
  ANCHOR: A,
  LABEL_H,
  STACK_GAP,
  OMEGA_GAP,
  STEP_X,
  CAP_STEP,
  COL_GAP,
  CHAMFER,
  MARGIN,
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
  const cols = Math.max(1, Math.min(3, count));
  const rows = Math.ceil(Math.max(1, count) / cols);
  return { cols, w: PAD_L + cols * TILE + (cols - 1) * GAP, h: rows * (TILE + GAP) - GAP };
}

export function layoutShipTree(input: ShipTreeLayoutInput): ShipTreeLayout {
  const { defs, hullCounts } = input;
  const omega = input.needsOmega;
  const nodes: ShipTreeNode[] = [];
  const edges: RawEdge[] = [];
  const omegas: Point[] = [];
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
    const sx = capital?.trunkX ?? parent.x + A;
    const sy = parent.y + A;
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
      const ey = y + A;
      const dd = x - sx < 1 ? 0 : x - sx;
      if (dd === 0) edge(def.id, M(sx, sy), V(ey));
      else edge(def.id, M(sx, sy), V(ey + dd), L(x, ey));
      if (needsOmega) {
        const lower = prevTop - LABEL_H - 8;
        const upper = dd === 0 ? y + s.h : ey + dd;
        omegas.push({ x: sx, y: (lower + upper) / 2 });
        omegaSeen = true;
      }
      reach = Math.max(reach, right(n));
      prevTop = y;
    });
    return { reach, topY: prevTop };
  }

  const corvetteDef = defs.find((d) => d.id === 4 && d.lane === 'main');
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
    corvette = place(corvetteDef, 0, 200);
    root = { x: -175, y: corvette.y + A };
    edge(4, M(root.x + 28, root.y), H(corvette.x));
    x = right(corvette) + 164;
  } else {
    root = { x: 0, y: A };
    x = root.x + 28 + 140 + (rootOmega ? 90 : 0) + (forkFromRoot ? 110 : 0);
  }
  const forkX = root.x + 28 + 70 + (rootOmega ? 90 : 0);
  if (rootOmega) omegas.push({ x: root.x + 28 + 70, y: A });

  const mains: ShipTreeNode[] = [];
  let branchTop = 0;
  for (const def of mainDefs) {
    const n = place(def, x, 0);
    const prev = mains[mains.length - 1];
    const capitals = kids(def.id, 'capital');
    const leftJunction = capitals.length > 0 && !!prev && def.id === 32;
    const junctionX = leftJunction ? n.x - 60 : right(n) + 60;
    if (prev) {
      edge(def.id, M(right(prev), A), H(n.x));
      if (omega(def.id) && !omega(prev.def.id)) {
        const end = leftJunction ? junctionX : n.x;
        omegas.push({ x: (right(prev) + end) / 2, y: A });
      }
    } else if (corvette) {
      const fx = n.x + A;
      const cy = corvette.y + A;
      edge(def.id, M(right(corvette), cy), H(fx - CHAMFER), L(fx, cy - CHAMFER), V(n.y + ICON));
    } else {
      edge(def.id, M(root.x + 28, A), H(n.x));
    }
    mains.push(n);

    const branches = stack(n, kids(def.id, 'branch'), n.y);
    let reach = branches.reach;
    branchTop = Math.min(branchTop, branches.topY);
    const firstCapital = capitals[0];
    if (firstCapital) {
      if (!leftJunction) edge(firstCapital.id, M(right(n), A), H(junctionX));
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
      const from = { x: n.x + A, y: n.y + A };
      if (kids(def.id, 'branch').length === 0 && capitals.length === 0) {
        emblems.push({ factionID: top, x: from.x, y: n.y - 126, from });
      }
      emblems.push({ factionID: bottom, x: from.x, y: n.y + n.h + 70, from });
    }
    x = reach + COL_GAP;
  }

  // Industrial line.
  const mainBottom = Math.max(
    corvette ? corvette.y + corvette.h : 0,
    ...mains.map((n) => n.y + n.h),
    ...emblems.map((e) => e.y + 20)
  );
  const stackHeight = (d: ShipTreeNodeDef) =>
    kids(d.id, 'branch').reduce((sum, k) => sum + size(k).h + STACK_GAP + OMEGA_GAP, 0);
  const industryY = Math.max(
    corvette ? 498 : 280,
    mainBottom + 60 + Math.max(0, ...industryDefs.map(stackHeight))
  );
  const industry: ShipTreeNode[] = [];
  industryDefs.forEach((def, i) => {
    const prev = industry[industry.length - 1];
    let ix: number;
    if (corvette) {
      ix =
        i === 0
          ? corvette.x + 204
          : (mains[Math.round((i * (mains.length - 1)) / (industryDefs.length - 1))]?.x ?? 0);
    } else {
      ix = prev ? right(prev) + 150 : (mains[0]?.x ?? 0) + 250;
    }
    const n = place(def, ix, industryY);
    const iy = industryY + A;
    if (prev) {
      edge(def.id, M(right(prev), iy), H(n.x));
      if (omega(def.id) && !omega(prev.def.id)) omegas.push({ x: (right(prev) + n.x) / 2, y: iy });
    } else {
      const fx = corvette ? corvette.x + A : forkX;
      const fy = corvette ? corvette.y + ICON : A;
      edge(def.id, M(fx, fy), V(iy - CHAMFER), L(fx + CHAMFER, iy), H(n.x));
      const covered = corvette ? omega(4) : rootOmega;
      if (omega(def.id) && !covered) omegas.push({ x: fx, y: (fy + iy - CHAMFER) / 2 });
    }
    industry.push(n);
    stack(n, kids(def.id, 'branch'), n.y);
    // Drops hang on a third row; x (and the path) is fixed up below once the
    // line's far end is known (ORE: Bowhead under the Rorqual).
    for (const d of kids(def.id, 'drop')) {
      const dn = place(d, ix, industryY + 278);
      edge(d.id);
      if (omega(d.id) && !omega(def.id)) omegas.push({ x: n.x + A, y: dn.y - 40 });
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
      if (parent && e) e.segs = [M(parent.x + A, parent.y + ICON), V(n.y + A), H(n.x)];
    }
  }

  // Anything the template doesn't place still shows up, bottom-left.
  const placed = new Set(nodes.map((n) => n.def.id));
  let strayX = 0;
  const strayY = Math.max(0, ...nodes.map((n) => n.y + n.h)) + 200;
  for (const def of defs) {
    if (placed.has(def.id)) continue;
    strayX = right(place(def, strayX, strayY)) + COL_GAP;
  }

  const minX = Math.min(root.x, ...nodes.map((n) => n.x));
  const minY = Math.min(
    ...nodes.map((n) => n.y - LABEL_H),
    ...emblems.map((e) => e.y - 20),
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
    omegas: omegas.map(shift),
    emblems: finalEmblems,
    root: finalRoot,
    width: Math.max(finalRoot.x + 28, ...finalNodes.map(right)) + MARGIN,
    height:
      Math.max(
        finalRoot.y,
        ...finalNodes.map((n) => n.y + n.h),
        ...finalEmblems.map((e) => e.y + 20)
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
