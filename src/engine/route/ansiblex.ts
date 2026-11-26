import { securityBand } from '../securityStatus';
import { isWormholeSystem } from './routeSafety';

export const ANSIBLEX_TYPE_ID = 35841;

export const ANSIBLEX_SEARCH = ' » ';

export interface AnsiblexGate {
  fromId: number;
  toId: number;
  name: string;
}

export interface AnsiblexName {
  from: string;
  to: string;
  label: string | null;
}

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

export type SystemLookup = (name: string) => { id: number; security: number } | undefined;

function canHoldAnsiblex(system: { id: number; security: number }): boolean {
  return !isWormholeSystem(system.id) && securityBand(system.security) === 'nullsec';
}

export interface GateListError {
  line: number;
  text: string;
  reason: 'format' | 'unknown' | 'same-system' | 'not-nullsec';
  names: string[];
}

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

export interface FoundStructure {
  name: string;
  solar_system_id: number;
  type_id?: number;
}

export function foundGate(
  structure: FoundStructure,
  lookup: SystemLookup
): { kind: 'gate'; gate: AnsiblexGate } | { kind: 'skip' } | { kind: 'unknown'; names: string[] } {
  if (structure.type_id !== undefined && structure.type_id !== ANSIBLEX_TYPE_ID) {
    return { kind: 'skip' };
  }
  const name = parseAnsiblexName(structure.name);
  if (name === null) return { kind: 'skip' };
  const near = lookup(name.from);
  if (near && near.id !== structure.solar_system_id) return { kind: 'skip' };
  const read = readGate(name, structure.name, lookup);
  if ('kind' in read) return read;
  return read.reason === 'unknown' ? { kind: 'unknown', names: read.names } : { kind: 'skip' };
}

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

export function bridgeBetween(
  gates: readonly AnsiblexGate[],
  from: number,
  to: number
): AnsiblexGate | null {
  return (
    gates.find((gate) => gate.fromId === from && gate.toId === to) ??
    gates.find((gate) => gate.fromId === to && gate.toId === from) ??
    null
  );
}
