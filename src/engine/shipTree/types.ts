export type ShipTreeLane = 'main' | 'branch' | 'capital' | 'industry' | 'drop';

export interface ShipTreeNodeDef {
  id: number;
  parent: number | null;
  lane: ShipTreeLane;
}

export interface Point {
  x: number;
  y: number;
}

export interface ShipTreeNode {
  def: ShipTreeNodeDef;
  x: number;
  y: number;
  cols: number;
  w: number;
  h: number;
}

export interface ShipTreeEdge {
  key: string;
  d: string;
  childId: number;
}

export interface ShipTreeOmega extends Point {
  classId: number;
}

export interface ShipTreeEmblem extends Point {
  factionID: number;
  from: Point;
}

export interface ShipTreeLayout {
  nodes: ShipTreeNode[];
  edges: ShipTreeEdge[];
  omegas: ShipTreeOmega[];
  emblems: ShipTreeEmblem[];
  root: Point;
  width: number;
  height: number;
}

export interface ShipTreeLayoutInput {
  factionID: number;
  defs: readonly ShipTreeNodeDef[];
  hullCounts: ReadonlyMap<number, number>;
  needsOmega: (classId: number) => boolean;
  parentEmpires: (classId: number) => readonly number[];
}

export interface ShipTreeHullStatus {
  canFly: boolean;
  secondsToFly: number;
  mastery: number;
}

export type ShipTreeTileTone = 'elite' | 'canFly' | 'locked';
