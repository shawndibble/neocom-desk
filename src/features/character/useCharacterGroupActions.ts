import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeferredCommits } from '@/components/ui/useDeferredCommits';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import {
  updateGroups,
  useOverviewGroups,
  type OverviewGroupsValue,
} from '@/features/character/overviewGroups';
import {
  addGroup,
  moveCharacterToGroup,
  removeGroup,
  renameGroup,
  swapGroups,
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
  const { t } = useTranslation();
  const pendingGroupDeletes = useDeferredCommits();
  const shownGroups = useMemo(
    () => groupsValue.groups.filter((group) => !pendingGroupDeletes.hiddenIds.has(group.id)),
    [groupsValue.groups, pendingGroupDeletes.hiddenIds]
  );

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

  function handleRemoveGroup(groupId: string) {
    const at = shownGroups.findIndex((group) => group.id === groupId);
    if (at < 0) return;
    const nextId = shownGroups[at + 1]?.id;
    pendingGroupDeletes.defer({
      id: groupId,
      message: t('characters.groupDeleted', { name: shownGroups[at].name }),
      commit: () =>
        setGroupsValue(
          updateGroups(
            useOverviewGroups.getState().value,
            (groups) => removeGroup(groups, groupId),
            Date.now()
          )
        ),
    });
    focusAfterCommit(
      () => document.querySelector<HTMLElement>(`[data-group-heading="${nextId}"]`),
      () => document.querySelector<HTMLElement>('[data-ungrouped-heading]'),
      newGroupButton
    );
  }

  async function handleMoveGroup(index: number, direction: -1 | 1) {
    const groupId = shownGroups[index]?.id;
    const neighborId = shownGroups[index + direction]?.id;
    if (groupId === undefined || neighborId === undefined) return;
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => swapGroups(groups, groupId, neighborId), Date.now())
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
    shownGroups,
    pendingGroupDeletes,
    handleMoveToGroup,
    handleCreateGroup,
    cancelCreateGroup,
    handleRenameGroup,
    handleRemoveGroup,
    handleMoveGroup,
  };
}
