import type { MouseEvent } from 'react';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import {
  focusRingClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import {
  CharacterAvatar,
  DataAgeBadge,
  IconButton,
  IskAmount,
  RowMoreActions,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatChip,
  StatChips,
} from '@/components/ui';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import * as Icon from '@/components/ui/icons';
import type { CharacterRecord } from '@/db';
import { usePublicInfo } from '@/stores/publicInfo';
import type { QueueInfo } from '@/features/character/rosterView';
import type { CharacterGroup, CharacterSortStats } from '@/features/character/groups';
import { formatCompactNumber } from '@/lib/compactNumber';
import { AchievementLine } from '@/features/character/AchievementLine';
import { CharacterRowContextMenu } from '@/features/character/CharacterRowContextMenu';
import { NeedsLoginAction } from '@/features/character/NeedsLoginAction';
import type { AchievementParts } from '@/features/character/achievement';
import {
  UNGROUPED_VALUE,
  characterLastSynced,
  queueChipTone,
} from '@/features/character/rosterQueueChip';

interface CharacterCardProps {
  character: CharacterRecord;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  notTrainingAlertEnabled: boolean;
  groups: readonly CharacterGroup[];
  groupId: string | null;
  starred: boolean;
  isActive: boolean;
  alertCount: number;
  onSelect: (characterId: number) => void;
  onToggleStar: (characterId: number) => void;
  onMoveToGroup: (characterId: number, groupId: string | null) => void;
  onRemove: (characterId: number, name: string) => void;
  achievement: AchievementParts | null | undefined;
}

export function AffiliationName({ name }: { name: string | null | undefined }) {
  const { t } = useTranslation();
  return <>{name || t('common.unknown')}</>;
}

export function CharacterCard({
  character,
  stats,
  queue,
  notTrainingAlertEnabled,
  groups,
  groupId,
  starred,
  isActive,
  alertCount,
  onSelect,
  onToggleStar,
  onMoveToGroup,
  onRemove,
  achievement,
}: CharacterCardProps) {
  const info = usePublicInfo((state) => state.byCharacterId[character.characterId]);
  const { t } = useTranslation();
  const lastSynced = characterLastSynced(stats, queue);

  const handleCardClick = (event: MouseEvent<HTMLLIElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    if (target.closest('button, a, input, [role="combobox"]')) return;
    if (window.getSelection()?.toString()) return;
    onSelect(character.characterId);
  };

  return (
    <CharacterRowContextMenu
      characterId={character.characterId}
      name={character.name}
      onRemove={() => onRemove(character.characterId, character.name)}
    >
      <li
        aria-current={isActive ? 'true' : undefined}
        onClick={handleCardClick}
        className={cx(
          'cursor-pointer flex flex-col gap-2 rounded-xs border border-line p-3 backdrop-blur-sm hover:border-line-bright hover:bg-panel-2',
          interactiveClassName,
          isActive ? selectedRowClassName : 'bg-panel/85'
        )}
      >
        <RowTappableContext.Provider value>
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex min-w-40 flex-1 items-start gap-3">
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => onSelect(character.characterId)}
                className={cx('shrink-0 rounded-xs', interactiveClassName)}
              >
                <CharacterAvatar
                  characterId={character.characterId}
                  size="lg"
                  loading="lazy"
                  alt={t('characters.portraitAlt', { name: character.name })}
                />
              </button>
              <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                  <button
                    type="button"
                    aria-label={t('characters.select', { name: character.name })}
                    data-character-select={character.characterId}
                    onClick={() => onSelect(character.characterId)}
                    className={cx(
                      'inline-flex min-h-6 max-w-full items-center truncate rounded-xs text-left text-sm font-semibold',
                      interactiveClassName,
                      focusRingClassName
                    )}
                  >
                    {character.name}
                  </button>
                  {isActive && (
                    <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
                      {t('characters.activeLabel')}
                    </span>
                  )}
                  {lastSynced && (
                    <DataAgeBadge date={lastSynced} dotOnly alwaysVisible className="shrink-0" />
                  )}
                  <NeedsLoginAction characterId={character.characterId} name={character.name} />
                </span>
                <span className="block truncate text-xs text-text-dim">
                  <AffiliationName name={info?.corporationName} />
                </span>
                <span className="block truncate text-xs text-text-dim">
                  <AffiliationName name={info?.allianceName} />
                </span>
                <AchievementLine parts={achievement} />
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <IconButton
                icon={<Icon.Pin weight={starred ? 'fill' : 'light'} />}
                label={t(starred ? 'characters.unstar' : 'characters.star', {
                  name: character.name,
                })}
                pressed={starred}
                onClick={() => onToggleStar(character.characterId)}
              />
              {groups.length > 0 && (
                <Select
                  value={groupId ?? UNGROUPED_VALUE}
                  onValueChange={(value) =>
                    onMoveToGroup(character.characterId, value === UNGROUPED_VALUE ? null : value)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={t('characters.groupFor', { name: character.name })}
                    data-group-select={character.characterId}
                    className="w-32 shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNGROUPED_VALUE}>{t('characters.ungrouped')}</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <RowMoreActions hints={false} />
            </div>
          </div>
          <StatChips>
            <StatChip
              label={t('characters.spLabel')}
              value={
                stats?.skillPoints === undefined
                  ? t('common.unknown')
                  : formatCompactNumber(stats.skillPoints)
              }
            />
            <StatChip
              label={t('characters.walletLabel')}
              value={
                stats?.wallet === undefined ? (
                  t('common.unknown')
                ) : (
                  <IskAmount value={stats.wallet} />
                )
              }
            />
            {queue && (
              <StatChip
                label={t('characters.queueState')}
                tone={queueChipTone(queue.state, notTrainingAlertEnabled)}
                value={t(`characters.queueStates.${queue.state}`)}
              />
            )}
            {alertCount > 0 && (
              <StatChip label={t('characters.column.alerts')} tone="warning" value={alertCount} />
            )}
          </StatChips>
        </RowTappableContext.Provider>
      </li>
    </CharacterRowContextMenu>
  );
}
