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
import { isPiExpired, type AttentionEntry } from '@/features/character/rosterAttention';
import type { QueueInfo } from '@/features/character/rosterView';
import type { CharacterGroup, CharacterSortStats } from '@/features/character/groups';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatDuration } from '@/lib/duration';
import { CharacterAchievementLine } from '@/features/character/AchievementLine';
import {
  UNGROUPED_VALUE,
  characterLastSynced,
  queueChipTone,
} from '@/features/character/rosterQueueChip';

interface CharacterCardProps {
  character: CharacterRecord;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  /** Whether this Character's `characterNotTraining` alert is on — false only for its one opt-out (issue #1731). */
  notTrainingAlertEnabled: boolean;
  groups: readonly CharacterGroup[];
  groupId: string | null;
  starred: boolean;
  isActive: boolean;
  alertCount: number;
  attention: AttentionEntry | undefined;
  /** One clock shared by every card (`useNow()` called once in `Characters`), not one interval per card — a large roster would otherwise re-render every card every tick regardless of whether it has anything counting down. */
  now: number;
  onSelect: (characterId: number) => void;
  onToggleStar: (characterId: number) => void;
  onMoveToGroup: (characterId: number, groupId: string | null) => void;
  onRemove: (characterId: number, name: string) => void;
}

type PiCardAttention = { kind: 'stopped' } | { kind: 'expiring'; expiryMs: number };

/** Card view's narrower PI signal (decision `20260925-230353`): only `idle`/`expiring-soon` reach a card, gated *before* `isPiExpired` — `decayed` also carries a real `piSoonestExpiryMs` and must stay table-only even once it's passed. */
function piCardAttention(
  attention: AttentionEntry | undefined,
  nowMs: number
): PiCardAttention | null {
  const piAttention = attention?.piAttention;
  if (piAttention !== 'idle' && piAttention !== 'expiring-soon') return null;
  if (piAttention === 'idle') return { kind: 'stopped' };
  const expiryMs = attention?.piSoonestExpiryMs;
  if (isPiExpired(expiryMs, nowMs)) return { kind: 'stopped' };
  return expiryMs != null ? { kind: 'expiring', expiryMs } : null;
}
/**
 * A corp or alliance name, plain: a roster row or card selects the Character,
 * so its Show Info links live in the selected Character's header (§6c).
 */
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
  attention,
  now,
  onSelect,
  onToggleStar,
  onMoveToGroup,
  onRemove,
}: CharacterCardProps) {
  // Own entry, not the page's whole map: a fetch for another card leaves this one alone.
  const info = usePublicInfo((state) => state.byCharacterId[character.characterId]);
  const { t } = useTranslation();
  // One badge for the whole card, not one per stat (that was the actual
  // complaint — three "Xm ago"s in a row): the oldest of whichever fields
  // this character has cached, so the card never overstates its freshness.
  const lastSynced = characterLastSynced(stats, queue);
  const piChip = piCardAttention(attention, now);

  // Pointer convenience for the whole card; the name button stays the keyboard
  // control. React events bubble out of portals (the group Select's menu), so
  // only DOM descendants count, never a control, and never the end of a
  // drag-select (the app sits beside the EVE client for copy/paste).
  const handleCardClick = (event: MouseEvent<HTMLLIElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    if (target.closest('button, a, input, [role="combobox"]')) return;
    if (window.getSelection()?.toString()) return;
    onSelect(character.characterId);
  };

  return (
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
            {/* Pointer convenience: the name below is the keyboard and screen-reader
              control, so this avatar target stays out of both. */}
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
              {/* The dot rides the name's own line, not a corner of the card:
                it needs no room of its own, so the identity block loses
                nothing to make space for it. `min-w-0` on this row (not just
                the outer `span`) is what lets the name still truncate instead
                of pushing the dot off — and shrinking the name never touches
                the corp/alliance lines below, which are separate rows. */}
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                <button
                  type="button"
                  aria-label={t('characters.select', { name: character.name })}
                  data-character-select={character.characterId}
                  onClick={() => onSelect(character.characterId)}
                  className={cx(
                    'max-w-full truncate rounded-xs text-left text-sm font-semibold',
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
              </span>
              <span className="block truncate text-xs text-text-dim">
                <AffiliationName name={info?.corporationName} />
              </span>
              <span className="block truncate text-xs text-text-dim">
                <AffiliationName name={info?.allianceName} />
              </span>
              <CharacterAchievementLine characterId={character.characterId} />
            </span>
          </div>
          {/* Group and remove: the card's own controls, not part of the
            name/corp/alliance identity block, so they sit at the top right
            rather than crowding the stat row below. */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Filled when starred, outline when not — the state is on the glyph
              as well as in the accent `pressed` treatment, so it survives a
              reader who can't tell the two colours apart. The label says which
              way the press goes, not just which card it belongs to. */}
            <IconButton
              icon={<Icon.Pin weight={starred ? 'fill' : 'light'} />}
              label={t(starred ? 'characters.unstar' : 'characters.star', { name: character.name })}
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
            <IconButton
              icon={<Icon.Close />}
              tone="danger"
              label={t('characters.removeButtonLabel', { name: character.name })}
              onClick={() => onRemove(character.characterId, character.name)}
            />
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
              stats?.wallet === undefined ? t('common.unknown') : <IskAmount value={stats.wallet} />
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
          {piChip && (
            <StatChip
              label={t('characters.column.pi')}
              tone="warning"
              value={
                piChip.kind === 'stopped'
                  ? t('pi.attention.idle')
                  : formatDuration((piChip.expiryMs - now) / 1000)
              }
            />
          )}
        </StatChips>
      </RowTappableContext.Provider>
    </li>
  );
}
