import { readCachedEntries, readCachedRows } from '@/esi/cache';
import type { Contract, ContractItem } from '@/esi/endpoints';
import type { ContractStockInput } from '@/engine/stockTargets/onContract';
import { KEY as CONTRACTS_KEY } from '@/features/character/contracts';
import { contractItemsCacheKey } from '@/features/character/contractItems';

export async function readCachedContractStock(
  characterIds: readonly number[]
): Promise<ContractStockInput[]> {
  const lists = await readCachedRows<Contract[]>(characterIds, CONTRACTS_KEY);
  const perCharacter = await Promise.all(
    [...lists].map(async ([characterId, cached]) => {
      const open = cached.data.filter(
        (contract) => contract.type === 'item_exchange' && contract.status === 'outstanding'
      );
      const entries = await readCachedEntries<ContractItem[]>(
        characterId,
        open.map((contract) => contractItemsCacheKey(contract.contract_id))
      );
      return open.flatMap((contract): ContractStockInput[] => {
        const items = entries.get(contractItemsCacheKey(contract.contract_id))?.value;
        return items ? [{ characterId, contract, items }] : [];
      });
    })
  );
  return perCharacter.flat();
}
