/**
 * The header switcher's two kinds of choice: one Character (made the active
 * one, so every other page follows) or All characters (an Overview-only,
 * device-local view that leaves the active Character where it was).
 */
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewScopeAll } from './widgets/scope';

export async function setActiveCharacterAndScope(choice: string): Promise<void> {
  if (choice === 'all') {
    await useOverviewScopeAll.getState().setValue(true);
    return;
  }
  const id = Number(choice);
  if (!Number.isInteger(id)) return;
  await useActiveCharacter.getState().setActiveCharacter(id);
  await useOverviewScopeAll.getState().setValue(false);
}
