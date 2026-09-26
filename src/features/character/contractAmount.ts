import type { Contract } from '@/esi/endpoints';

/**
 * The single ISK figure a contract row shows and sorts on. A courier's
 * payout is its `reward` — ESI can send `price: 0` alongside it, and `??`
 * would treat that 0 as present. Other types use `price`, falling back to
 * `reward` only when `price` is missing. `undefined` when neither exists.
 */
export function contractAmount(contract: Pick<Contract, 'type' | 'price' | 'reward'>) {
  if (contract.type === 'courier') return contract.reward ?? contract.price;
  return contract.price ?? contract.reward;
}
