import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  standingChain,
  type ChainEntity,
  type SocialSkillLevels,
  type StandingChain,
} from '@/engine/standings';

/** What a Standings row or modal is about; an agent's corporation comes from the agents data. */
export type ChainTarget =
  | { kind: 'faction'; id: number }
  | { kind: 'corporation'; id: number }
  | { kind: 'agent'; id: number; corporationId: number };

/**
 * The chain of standings that govern `target`, faction first. A standing the
 * pilot has no row for reads as 0. A corporation whose faction is not in
 * `corporationFactions` gets no faction link and counts as lawful.
 */
export function buildChain(
  target: ChainTarget,
  standings: readonly CharacterStandingEntry[],
  corporationFactions: ReadonlyMap<number, number>,
  skills: SocialSkillLevels
): StandingChain {
  const baseOf = (id: number) => standings.find((entry) => entry.from_id === id)?.standing ?? 0;
  const entity = (kind: ChainEntity['kind'], id: number): ChainEntity => ({
    kind,
    id,
    base: baseOf(id),
  });

  if (target.kind === 'faction') {
    return standingChain([entity('faction', target.id)], target.id, skills);
  }
  const corporationId = target.kind === 'agent' ? target.corporationId : target.id;
  const factionId = corporationFactions.get(corporationId) ?? null;
  const entities = [
    ...(factionId === null ? [] : [entity('faction', factionId)]),
    entity('corporation', corporationId),
    ...(target.kind === 'agent' ? [entity('agent', target.id)] : []),
  ];
  return standingChain(entities, factionId, skills);
}
