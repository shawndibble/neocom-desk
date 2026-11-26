import type { BuildGroupMember } from '@/engine/industry/groupRollup';

export interface GroupMaterialConsumer {
  planId: string;
  planName: string;
  quantity: number;
}

export function groupMaterialConsumers(
  members: readonly BuildGroupMember[],
  typeID: number
): GroupMaterialConsumer[] {
  const consumers: GroupMaterialConsumer[] = [];
  for (const member of members) {
    let quantity = 0;
    for (const line of member.tableMaterials) {
      if (line.typeID === typeID) quantity += line.quantity;
    }
    if (quantity > 0)
      consumers.push({ planId: member.planId, planName: member.planName, quantity });
  }
  return consumers;
}
