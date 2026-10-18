import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterGroup } from '@/features/character/groups';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';

interface GroupSectionHeaderProps {
  group: CharacterGroup;
  index: number;
  groupCount: number;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

export function GroupSectionHeader({
  group,
  index,
  groupCount,
  onRename,
  onRemove,
  onMove,
}: GroupSectionHeaderProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const renameButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();

  // `returnFocus`: Enter and Escape remove the input, so focus goes back to
  // the Rename button; a blur means the user already went elsewhere.
  function commitRename(returnFocus: boolean) {
    setRenaming(false);
    if (returnFocus) focusAfterCommit(renameButton);
    const name = draftName.trim();
    if (name && name !== group.name) onRename(group.id, name);
    else setDraftName(group.name);
  }

  return (
    <div className="flex items-center gap-2">
      {renaming ? (
        <TextInput
          autoFocus
          size="sm"
          value={draftName}
          aria-label={t('characters.renameGroup')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => commitRename(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Focus moves to the Rename button below; without this the Enter's own
              // keypress would land on it and reopen the input.
              e.preventDefault();
              commitRename(true);
            }
            if (e.key === 'Escape') {
              setDraftName(group.name);
              setRenaming(false);
              focusAfterCommit(renameButton);
            }
          }}
          className="flex-1"
        />
      ) : (
        <h2
          data-group-heading={group.id}
          className="flex-1 truncate text-xs font-semibold tracking-widest text-text-dim uppercase focus:outline-none"
          onDoubleClick={() => setRenaming(true)}
        >
          {group.name}
        </h2>
      )}
      {/* Icon actions, like every other editable-row header in the app (the
          Skill Plan and Build Plan lists): the group name is the row, the
          actions are the adornment, and four labelled buttons left the name
          nothing on a phone. Each label names the group so a screen reader
          hears which one it is on. */}
      <IconButton
        size="sm"
        icon={<Icon.Ascending />}
        label={t('characters.moveGroupUp', { name: group.name })}
        data-move-group={`${group.id}:up`}
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
      />
      <IconButton
        size="sm"
        icon={<Icon.Descending />}
        label={t('characters.moveGroupDown', { name: group.name })}
        data-move-group={`${group.id}:down`}
        onClick={() => onMove(index, 1)}
        disabled={index === groupCount - 1}
      />
      <IconButton
        size="sm"
        ref={renameButton}
        icon={<Icon.Rename />}
        label={`${t('characters.renameGroup')} ${group.name}`}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        tone="danger"
        label={`${t('characters.deleteGroup')} ${group.name}`}
        onClick={() => onRemove(group.id)}
      />
    </div>
  );
}
