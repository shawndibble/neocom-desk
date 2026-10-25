/**
 * Whose Permissions Settings › Permissions is showing, and a one-tap way to
 * change it. Up to four Characters: one chip each, with its count and what it
 * is missing. More than four, or a phone: a picker whose trigger names the
 * active Character, listing those that need Permissions first (fewest granted
 * first), then the complete ones, with a search box. Picking switches the
 * active Character, so the panel below it needs no change. Absent for a single
 * Character: there is nobody to switch to.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger, SearchInput } from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  rowInteractiveClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { orderForPicker, pickerTone, type CharacterPermissionCount } from './permissionCounts';
import { useCharacterPermissionCounts } from './useCharacterPermissionCounts';

/** Beyond this many Characters the chips stop fitting one row. */
const MAX_CHIPS = 4;

function select(characterId: number) {
  void useActiveCharacter.getState().setActiveCharacter(characterId);
}

function Standing({ row }: { row: CharacterPermissionCount }) {
  const { t } = useTranslation();
  const missing = row.total - row.granted;
  return (
    <>
      <span className="text-xs tabular-nums text-text-dim">
        {t('settings.permissions.character.count', { granted: row.granted, total: row.total })}
      </span>
      {missing > 0 && (
        <Pill tone={pickerTone(row)}>
          {t('settings.permissions.character.missing', { count: missing })}
        </Pill>
      )}
    </>
  );
}

function Chips({
  rows,
  activeId,
}: {
  rows: readonly CharacterPermissionCount[];
  activeId: number | null;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('settings.permissions.character.label')}
      className="flex flex-wrap gap-2"
    >
      {rows.map((row) => {
        const active = row.characterId === activeId;
        return (
          <button
            key={row.characterId}
            type="button"
            aria-pressed={active}
            onClick={() => select(row.characterId)}
            className={cx(
              'flex min-h-9 items-center gap-2 rounded-xs border px-2 py-1 text-left',
              toggleChipStateClassName(active),
              focusRingClassName
            )}
          >
            <CharacterAvatar characterId={row.characterId} size="sm" selected={active} />
            <span className="text-sm">{row.name}</span>
            <Standing row={row} />
          </button>
        );
      })}
    </div>
  );
}

function PickerGroup({
  title,
  rows,
  activeId,
  onPick,
}: {
  title: string;
  rows: readonly CharacterPermissionCount[];
  activeId: number | null;
  onPick: (characterId: number) => void;
}) {
  const titleId = useId();
  if (rows.length === 0) return null;
  return (
    <div role="group" aria-labelledby={titleId}>
      <div
        id={titleId}
        className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-text-dim uppercase"
      >
        {title}
      </div>
      {rows.map((row) => (
        <button
          key={row.characterId}
          type="button"
          aria-current={row.characterId === activeId || undefined}
          onClick={() => onPick(row.characterId)}
          className={cx(
            'flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left',
            rowInteractiveClassName,
            row.characterId === activeId && 'bg-panel-2'
          )}
        >
          <CharacterAvatar
            characterId={row.characterId}
            size="sm"
            selected={row.characterId === activeId}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
          <Standing row={row} />
        </button>
      ))}
    </div>
  );
}

function Picker({
  rows,
  activeId,
}: {
  rows: readonly CharacterPermissionCount[];
  activeId: number | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const active = rows.find((row) => row.characterId === activeId);
  const needle = query.trim().toLowerCase();
  const { needs, complete } = orderForPicker(
    rows.filter((row) => row.name.toLowerCase().includes(needle))
  );
  const onPick = (characterId: number) => {
    select(characterId);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cx(
            'flex min-h-9 w-full items-center gap-2 rounded-xs border border-line bg-panel-2 px-2 py-1 text-left',
            focusRingClassName
          )}
        >
          {active ? (
            <>
              <CharacterAvatar characterId={active.characterId} size="sm" selected />
              <span className="min-w-0 flex-1 truncate text-sm">{active.name}</span>
              <Standing row={active} />
            </>
          ) : (
            <span className="flex-1 text-sm text-text-dim">
              {t('settings.permissions.character.choose')}
            </span>
          )}
          <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-w-[90vw] p-0">
        <div className="p-2">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.permissions.character.search')}
            aria-label={t('settings.permissions.character.search')}
          />
        </div>
        <div className="max-h-72 overflow-y-auto pb-1">
          <PickerGroup
            title={t('settings.permissions.character.needs', { count: needs.length })}
            rows={needs}
            activeId={activeId}
            onPick={onPick}
          />
          <PickerGroup
            title={t('settings.permissions.character.complete', { count: complete.length })}
            rows={complete}
            activeId={activeId}
            onPick={onPick}
          />
          {needs.length + complete.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-dim">
              {t('settings.permissions.character.noMatch')}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CharacterPermissionStrip() {
  const rows = useCharacterPermissionCounts();
  const activeId = useActiveCharacter((state) => state.activeCharacterId);
  const narrow = useIsNarrow();
  if (rows === undefined || rows.length < 2) return null;
  return rows.length <= MAX_CHIPS && !narrow ? (
    <Chips rows={rows} activeId={activeId} />
  ) : (
    <Picker rows={rows} activeId={activeId} />
  );
}
