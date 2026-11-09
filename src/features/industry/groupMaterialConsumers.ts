import type { BuildGroupMember } from '@/engine/industry/groupRollup';

export interface GroupMaterialConsumer {
  planId: string;
  planName: string;
  quantity: number;
}

/**
 * The plans of a Build Group that need `typeID`, and how much each needs: its
 * share of the Group Rollup's row, read from each member's own material table
 * (`tableMaterials`) so the shares add up to the row total. Plans, not jobs,
 * are the consumers here; members keep their order.
 */
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
