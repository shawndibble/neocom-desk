import { captureException } from '@sentry/react';
import type { Contract } from '@/esi/endpoints';
import type { Interaction } from '@/engine/interactions/interactions';
import { loadGrantedScopes } from '@/app/grantedScopes';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadContractsWithArchive } from '@/features/character/contracts';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import { contractInteractions, courierLocationIds } from './contractInteractions';
import type { PersonalSource } from './sourceTypes';

const CONTRACTS_SCOPE = ESI_REGISTRY.getCharacterContracts.scope;

function involvesOther(c: Contract, otherId: number): boolean {
  return c.issuer_id === otherId || c.assignee_id === otherId || c.acceptor_id === otherId;
}

export const contractSource: PersonalSource = async ({ otherId, characterIds, t }) => {
  const perCharacter = await Promise.all(
    characterIds.map(async (characterId): Promise<Interaction[]> => {
      try {
        if (!(await loadGrantedScopes(characterId)).has(CONTRACTS_SCOPE)) return [];
        const { cached, needsReauth } = await loadContractsWithArchive(characterId);
        if (!cached || needsReauth) return [];
        const contracts = cached.data.filter((c) => involvesOther(c, otherId));
        const locationNames = new Map<number, string>();
        await Promise.all(
          courierLocationIds(contracts).map(async (id) => {
            const name = await loadContractLocationName(characterId, id).catch(() => null);
            if (name) locationNames.set(id, name);
          })
        );
        return contractInteractions({
          characterId,
          otherId,
          contracts,
          locationNames,
          now: Date.now(),
          t,
        });
      } catch (error) {
        captureException(error);
        return [];
      }
    })
  );
  return perCharacter.flat();
};
