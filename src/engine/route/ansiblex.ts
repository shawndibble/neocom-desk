/**
 * Ansiblex jump gates (issue #2478): the alliance-built bridges a pilot's
 * characters can use, as more connections for Route Safety's search.
 *
 * Public ESI lists no Ansiblex, so the gates come from a character's
 * structure search, or from a list the pilot pastes. Either way a gate is
 * known by its name, which reads "SYS1 » SYS2 - …" in game; this module reads
 * those names and turns the gates into connections. Pure: the search, the
 * structure lookups and the stored list live in `features/travel`.
 *
 * Unlike a Thera / Turnur hole, a bridge makes no system free: each bridge is
 * one jump, and the system it lands in is charged like any other. So bridges
 * go into the search's `extraConnections` and never its `freeSystems`.
 */
import { securityBand } from '../securityStatus';
import type { JumpGraph } from './jumpRoute';
import { isWormholeSystem } from './routeSafety';

/** The Ansiblex Jump Bridge's type id. */
export const ANSIBLEX_TYPE_ID = 35841;

/**
 * What the structure search asks for. ESI will not search fewer than three
 * characters, and a lone "»" is one; with a space either side it still
 * matches every "SYS1 » SYS2" name, as the search is a substring match.
 */
export const ANSIBLEX_SEARCH = ' » ';

/** One Ansiblex: the system it stands in, the one it jumps to, and its name. */
export interface AnsiblexGate {
  fromId: number;
  toId: number;
  name: string;
}

/** The two systems an Ansiblex name joins, and the gate's own name after them. */
export interface AnsiblexName {
  from: string;
  to: string;
  label: string | null;
}

/**
 * Reads "SYS1 » SYS2" or the full in-game "SYS1 » SYS2 - name". The far
 * system ends at the first " - " (spaced), never a bare dash: nullsec names
 * like 1DQ1-A carry their own.
 */
export function parseAnsiblexName(text: string): AnsiblexName | null {
  const parts = text.split('»');
  if (parts.length !== 2) return null;
  const from = parts[0].trim();
  const rest = parts[1].trim();
  const cut = rest.indexOf(' - ');
  const to = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  const label = cut === -1 ? null : rest.slice(cut + 3).trim() || null;
  if (from === '' || to === '') return null;
  return { from, to, label };
}

/** A system named in a gate list: its id and security, or `undefined` when no system has that name. */
export type SystemLookup = (name: string) => { id: number; security: number } | undefined;

/** Ansiblex are sovereignty structures: only known-space nullsec holds one. */
function canHoldAnsiblex(system: { id: number; security: number }): boolean {
  return !isWormholeSystem(system.id) && securityBand(system.security) === 'nullsec';
}

/** A pasted line that is not a gate, and why. */
export interface GateListError {
  /** From 1. */
  line: number;
  text: string;
  reason: 'format' | 'unknown' | 'same-system' | 'not-nullsec';
  /** The names the reason is about: the unknown ones, or the ones outside nullsec. */
  names: string[];
}

/** One pair of systems, the same whichever way round: what a bridge's two ends are keyed by. */
export function bridgePairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

type ReadGate = { kind: 'gate'; gate: AnsiblexGate } | Omit<GateListError, 'line' | 'text'>;

function readGate(name: AnsiblexName, fullName: string, lookup: SystemLookup): ReadGate {
  const from = lookup(name.from);
  const to = lookup(name.to);
  const unknown = [...(from ? [] : [name.from]), ...(to ? [] : [name.to])];
  if (!from || !to) return { reason: 'unknown', names: unknown };
  if (from.id === to.id) return { reason: 'same-system', names: [] };
  const outside = [
    ...(canHoldAnsiblex(from) ? [] : [name.from]),
    ...(canHoldAnsiblex(to) ? [] : [name.to]),
  ];
  if (outside.length > 0) return { reason: 'not-nullsec', names: outside };
  return { kind: 'gate', gate: { fromId: from.id, toId: to.id, name: fullName } };
}

/**
 * A pasted list, one gate per line. Blank lines are skipped; a second line
 * for a pair already read (either way round) adds nothing.
 */
export function parseGateList(
  text: string,
  lookup: SystemLookup
): { gates: AnsiblexGate[]; errors: GateListError[] } {
  const gates: AnsiblexGate[] = [];
  const errors: GateListError[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    const name = parseAnsiblexName(line);
    if (name === null) {
      errors.push({ line: index + 1, text: line, reason: 'format', names: [] });
      return;
    }
    const read = readGate(name, line, lookup);
    if (!('kind' in read)) {
      errors.push({ line: index + 1, text: line, ...read });
      return;
    }
    const key = bridgePairKey(read.gate.fromId, read.gate.toId);
    if (seen.has(key)) return;
    seen.add(key);
    gates.push(read.gate);
  });
  return { gates, errors };
}

/** What a structure search found, as `/universe/structures/{id}` describes it. */
export interface FoundStructure {
  name: string;
  solar_system_id: number;
  /** ESI may leave it out; a name read as a gate then stands on its own. */
  type_id?: number;
}

/**
 * A structure the search found, as a gate: `skip` for any other structure
 * (the search matches every name with a "»" in it, and a name placing the
 * gate anywhere but the system ESI says is not trusted), `unknown` for a gate
 * naming a system this app has no name for.
 */
export function foundGate(
  structure: FoundStructure,
  lookup: SystemLookup
): { kind: 'gate'; gate: AnsiblexGate } | { kind: 'skip' } | { kind: 'unknown'; names: string[] } {
  if (structure.type_id !== undefined && structure.type_id !== ANSIBLEX_TYPE_ID) {
    return { kind: 'skip' };
  }
  const name = parseAnsiblexName(structure.name);
  if (name === null) return { kind: 'skip' };
  // The name must place the gate where ESI says it stands, or it is not read as one.
  const near = lookup(name.from);
  if (near && near.id !== structure.solar_system_id) return { kind: 'skip' };
  const read = readGate(name, structure.name, lookup);
  if ('kind' in read) return read;
  return read.reason === 'unknown' ? { kind: 'unknown', names: read.names } : { kind: 'skip' };
}

/** Each pair of systems the gates join, once, for the search to cross either way. */
export function bridgeConnections(gates: readonly AnsiblexGate[]): [number, number][] {
  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  for (const gate of gates) {
    const key = bridgePairKey(gate.fromId, gate.toId);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([gate.fromId, gate.toId]);
  }
  return pairs;
}

/** The connections the gates make, as a string: the trip re-plans only when it changes. */
export function bridgeKey(gates: readonly AnsiblexGate[]): string {
  return [...new Set(gates.map((gate) => bridgePairKey(gate.fromId, gate.toId)))].sort().join(',');
}

/** The pairs a {@link bridgeKey} was made from, as gates with no name: enough to route on. */
export function bridgeEndsFromKey(key: string): AnsiblexGate[] {
  if (key === '') return [];
  return key.split(',').flatMap((part) => {
    const [fromId, toId] = part.split(':').map(Number);
    return Number.isFinite(fromId) && Number.isFinite(toId) ? [{ fromId, toId, name: '' }] : [];
  });
}

/** The gate a step from one system to the next crosses, or `null`. */
export type BridgeAt = (from: number, to: number) => AnsiblexGate | null;

/**
 * Finds the gate each step crosses — the one standing in the system the step
 * leaves, when both ends have one. A step a stargate joins is a gate jump,
 * never a bridge.
 */
export function bridgeStepFinder(graph: JumpGraph, gates: readonly AnsiblexGate[]): BridgeAt {
  if (gates.length === 0) return () => null;
  return (from, to) => {
    if (graph.get(from)?.includes(to)) return null;
    return (
      gates.find((gate) => gate.fromId === from && gate.toId === to) ??
      gates.find((gate) => gate.fromId === to && gate.toId === from) ??
      null
    );
  };
}

/** The positions along a route entered over a bridge: index `i` is the step from `i - 1`. */
export function bridgeStepIndexes(systemIds: readonly number[], bridgeAt: BridgeAt): number[] {
  const indexes: number[] = [];
  for (let index = 1; index < systemIds.length; index += 1) {
    if (bridgeAt(systemIds[index - 1], systemIds[index])) indexes.push(index);
  }
  return indexes;
}
