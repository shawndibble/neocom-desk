import type { Contract } from '@/esi/endpoints';

export function contractAmount(contract: Pick<Contract, 'type' | 'price' | 'reward'>) {
  if (contract.type === 'courier') return contract.reward ?? contract.price;
  return contract.price ?? contract.reward;
}
