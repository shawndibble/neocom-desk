/**
 * Stable names for what Route Safety plans a trip with (issue #2539), so
 * `useRouteSafety` re-plans only when the network or a pin's answer changes —
 * never as the hole list's remaining life ticks down, nor as a list is
 * re-read into new arrays. Each name round-trips to just what planning
 * needs: a hole's ends, a bridge's two systems, a pinned hole's ends.
 *
 * These exist for React's dependency lists only, which is why they live
 * beside the hook and not in `engine/route`.
 */
import type { AnsiblexGate } from '@/engine/route/ansiblex';
import { bridgePairKey } from '@/engine/route/ansiblex';
import { parseLegPin, type PinnableHole } from '@/engine/route/legWays';
import type { HoleEnds } from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';

/** The holes' network, sorted, each exit/hub pair once. */
export function holeNetworkKey(holes: readonly HoleEnds[]): string {
  return [...new Set(holes.map((hole) => `${hole.exitSystemId}:${hole.hub}`))].sort().join(',');
}

/** The holes `holeNetworkKey` named, each exit/hub pair once, rebuilt from the name alone. */
export function holeEndsFromKey(key: string): HoleEnds[] {
  if (key === '') return [];
  return key.split(',').flatMap((pair): HoleEnds[] => {
    const [exit, hub] = pair.split(':');
    return hub === 'thera' || hub === 'turnur' ? [{ exitSystemId: Number(exit), hub }] : [];
  });
}

/** The connections the gates make: the same pairs in any order, names left out. */
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

/**
 * Each leg's pin, named with what the hole list says about it — the hole's
 * ends, or that it closed, or that there is no list yet — so the trip
 * re-plans when a pinned hole closes or the list arrives.
 */
export function pinsKey(
  pins: readonly string[],
  listed: ReadonlyMap<string, TheraConnection> | null
): string {
  return pins
    .map((token) => {
      const pin = parseLegPin(token);
      if (pin === null) return '';
      // Gates and the bridge list never wait on EVE-Scout's list.
      if (pin.kind === 'gates' || pin.kind === 'ansiblex') return token;
      if (listed === null) return `${token}@wait`;
      if (pin.kind === 'hub') return token;
      const hole = listed.get(pin.id);
      return hole ? `${token}@${holeNetworkKey([hole])}` : `${token}@closed`;
    })
    .join(',');
}

/**
 * The pins a {@link pinsKey} named: each leg's token, and the pinned holes
 * the list still holds — `listed` is `null` while there was no list.
 */
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
      // Ends that do not read leave the hole out: closed, as far as planning can tell.
      if (ends) holes.push({ ...ends, id: token });
    }
  }
  return { tokens, listed: waiting ? null : holes };
}
