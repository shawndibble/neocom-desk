import type { AnsiblexGate } from '@/engine/route/ansiblex';
import { bridgePairKey } from '@/engine/route/ansiblex';
import { parseLegPin, pinWaitsOnHoleList, type PinnableHole } from '@/engine/route/legWays';
import type { HoleEnds } from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';

export function holeNetworkKey(holes: readonly HoleEnds[]): string {
  return [...new Set(holes.map((hole) => `${hole.exitSystemId}:${hole.hub}`))].sort().join(',');
}

export function holeEndsFromKey(key: string): HoleEnds[] {
  if (key === '') return [];
  return key.split(',').flatMap((pair): HoleEnds[] => {
    const [exit, hub] = pair.split(':');
    return hub === 'thera' || hub === 'turnur' ? [{ exitSystemId: Number(exit), hub }] : [];
  });
}

export function bridgeKey(gates: readonly AnsiblexGate[]): string {
  return [...new Set(gates.map((gate) => bridgePairKey(gate.fromId, gate.toId)))].sort().join(',');
}

export function bridgeEndsFromKey(key: string): AnsiblexGate[] {
  if (key === '') return [];
  return key.split(',').flatMap((part) => {
    const [fromId, toId] = part.split(':').map(Number);
    return Number.isFinite(fromId) && Number.isFinite(toId) ? [{ fromId, toId, name: '' }] : [];
  });
}

export function pinsKey(
  pins: readonly string[],
  listed: ReadonlyMap<string, TheraConnection> | null
): string {
  return pins
    .map((token) => {
      const pin = parseLegPin(token);
      if (pin === null) return '';
      if (!pinWaitsOnHoleList(pin)) return token;
      if (listed === null) return `${token}@wait`;
      if (pin.kind === 'hub') return token;
      const hole = listed.get(pin.id);
      return hole ? `${token}@${holeNetworkKey([hole])}` : `${token}@closed`;
    })
    .join(',');
}

export function pinsFromKey(key: string): {
  tokens: string[];
  listed: PinnableHole[] | null;
} {
  if (key === '') return { tokens: [], listed: [] };
  const tokens: string[] = [];
  const holes: PinnableHole[] = [];
  let waiting = false;
  for (const part of key.split(',')) {
    const [token, about] = part.split('@');
    tokens.push(token);
    if (about === 'wait') waiting = true;
    else if (about !== undefined && about !== 'closed') {
      const [ends] = holeEndsFromKey(about);
      if (ends) holes.push({ ...ends, id: token });
    }
  }
  return { tokens, listed: waiting ? null : holes };
}
