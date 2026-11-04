/**
 * The contract half of a Stock List's Listed count, read from the cache only.
 *
 * A contract's items are fetched on demand (the contract detail modal) and by
 * the net-worth snapshot, never by Stock: this runs inside the foreground
 * alert poll, where a live read would fan a request out per contract. So the
 * count is only as fresh as the last snapshot or opened contract, and a contract
 * whose items were never read contributes nothing rather than a guess.
 */
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
      // Only live, own item exchange contracts can hold stock; the engine re-checks the rest.
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
