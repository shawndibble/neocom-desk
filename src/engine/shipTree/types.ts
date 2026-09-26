/**
 * The Ship Tree engine's contract: pure data in, geometry and per-pilot
 * status out. No DOM, fetch or Dexie here (CLAUDE.md: pure engines stay
 * pure). The shapes below are what `features/fittings/shipTree` renders.
 */

/**
 * Where a class sits relative to its parent:
 * - main: the left-to-right hull line.
 * - branch: stacked straight up above the parent (Navy directly above,
 *   the rest stepped right).
 * - capital: a second trunk off the main line beside the parent
 *   (Carrier / Command Carrier / Titan beside the Dreadnought).
 * - industry: the lower line (Shuttle → Hauler → Freighter; ORE's hauler line).
 * - drop: hangs on a third row below its parent (ORE's Bowhead).
 */
export type ShipTreeLane = 'main' | 'branch' | 'capital' | 'industry' | 'drop';

/** One class in a faction's tree: its id (shipTreeGroups) and where it hangs. */
export interface ShipTreeNodeDef {
  id: number;
  parent: number | null;
  lane: ShipTreeLane;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A placed class. (x, y) is the class icon's top-left; tiles start at
 * x + PAD_L. `cols` tiles per row; w/h cover icon column + tile grid
 * (the label sits LABEL_H above y and is not in h).
 */
export interface ShipTreeNode {
  def: ShipTreeNodeDef;
  x: number;
  y: number;
  cols: number;
  w: number;
  h: number;
}

/** One connector, as an SVG path `d`, lit when `childId`'s class is unlocked. */
export interface ShipTreeEdge {
  key: string;
  d: string;
  childId: number;
}

/** A pirate class's link to one of its two parent empires. */
export interface ShipTreeEmblem extends Point {
  factionID: number;
  /** The class-icon centre the link's line starts from. */
  from: Point;
}

/**
 * A laid-out faction tree, every coordinate already offset into
 * [0, width] × [0, height] (MARGIN on each side).
 */
export interface ShipTreeLayout {
  nodes: ShipTreeNode[];
  edges: ShipTreeEdge[];
  /** Gold Ω markers — centre points on a line. */
  omegas: Point[];
  emblems: ShipTreeEmblem[];
  /** The capsule the tree starts from — its line runs right from root.x + 28. */
  root: Point;
  width: number;
  height: number;
}

/** What the layout needs to know per class, beyond the template. */
export interface ShipTreeLayoutInput {
  factionID: number;
  defs: readonly ShipTreeNodeDef[];
  /** Class id -> how many hulls this faction has in it. */
  hullCounts: ReadonlyMap<number, number>;
  /** Class id -> needs an Omega clone (see `classNeedsOmega`). */
  needsOmega: (classId: number) => boolean;
  /** Class id -> its two parent empires, [bottom, top]; [] for none. */
  parentEmpires: (classId: number) => readonly number[];
}

/** One hull's standing for one pilot. */
export interface ShipTreeHullStatus {
  canFly: boolean;
  /** Training seconds for the hull's own missing required skills; 0 when flyable. */
  secondsToFly: number;
  /** 0–5: highest Mastery tier fully trained (0 when the hull can't be flown). */
  mastery: number;
}

/** How a tile is drawn: gold at Mastery V only, bright when flyable, dim otherwise. */
export type ShipTreeTileTone = 'elite' | 'canFly' | 'locked';
