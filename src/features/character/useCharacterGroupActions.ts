import { useRef, useState } from 'react';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { updateGroups, type OverviewGroupsValue } from '@/features/character/overviewGroups';
import {
  addGroup,
  moveCharacterToGroup,
  removeGroup,
  renameGroup,
  reorderGroups,
  type CharacterGroup,
} from '@/features/character/groups';

export function useCharacterGroupActions(
  groupsValue: OverviewGroupsValue,
  setGroupsValue: (next: OverviewGroupsValue) => Promise<void>
) {
  const [addingGroup, setAddingGroup] = useState(false);
  const newGroupButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const [newGroupName, setNewGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  async function handleMoveToGroup(characterId: number, groupId: string | null) {
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => moveCharacterToGroup(groups, characterId, groupId),
        Date.now()
      )
    );
    focusAfterCommit(() =>
      document.querySelector<HTMLElement>(`[data-group-select="${characterId}"]`)
    );
  }

  async function handleCreateGroup(returnFocus: boolean) {
    const name = newGroupName.trim();
    setAddingGroup(false);
    setNewGroupName('');
    if (returnFocus) focusAfterCommit(newGroupButton);
    if (!name) return;
    const group: CharacterGroup = { id: crypto.randomUUID(), name, characterIds: [] };
    if (returnFocus) {
      focusAfterCommit(() =>
        document.querySelector<HTMLElement>(`[data-group-heading="${group.id}"]`)
      );
    }
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => addGroup(groups, group), Date.now())
    );
  }

  function cancelCreateGroup() {
    setNewGroupName('');
    setAddingGroup(false);
    focusAfterCommit(newGroupButton);
  }

  async function handleRenameGroup(groupId: string, name: string) {
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => renameGroup(groups, groupId, name), Date.now())
    );
  }

  async function handleRemoveGroup(groupId: string) {
    const at = groupsValue.groups.findIndex((group) => group.id === groupId);
    const nextId = groupsValue.groups[at + 1]?.id;
    setDeletingGroupId(null);
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => removeGroup(groups, groupId), Date.now())
    );
    focusAfterCommit(
      () => document.querySelector<HTMLElement>(`[data-group-heading="${nextId}"]`),
      () => document.querySelector<HTMLElement>('[data-ungrouped-heading]'),
      newGroupButton
    );
  }

  async function handleMoveGroup(index: number, direction: -1 | 1) {
    const groupId = groupsValue.groups[index]?.id;
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => reorderGroups(groups, index, index + direction),
        Date.now()
      )
    );
    const enabledMove = (side: 'up' | 'down') => () => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-move-group="${groupId}:${side}"]`
      );
      return el && !el.disabled ? el : null;
    };
    const [same, other] = direction === -1 ? (['up', 'down'] as const) : (['down', 'up'] as const);
    focusAfterCommit(enabledMove(same), enabledMove(other));
  }

  return {
    addingGroup,
    setAddingGroup,
    newGroupButton,
    newGroupName,
    setNewGroupName,
    deletingGroupId,
    setDeletingGroupId,
    handleMoveToGroup,
    handleCreateGroup,
    cancelCreateGroup,
    handleRenameGroup,
    handleRemoveGroup,
    handleMoveGroup,
  };
}
