/**
 * One row of the event-first Notifications page: a label, a "K differ" chip,
 * and two tri-state checkboxes that speak for every Character the row
 * applies to. Opening it shows the Characters as chips (inline from `md` up,
 * a bottom sheet on a phone) so the odd ones out can be fixed.
 *
 * Used for Notification Events and, with the same shape, for each EVE
 * notification type. The caller supplies how to read and write one value, so
 * this holds no preference logic of its own.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, Modal } from '@/components/ui';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { CHANNEL_COLUMNS } from './ChannelColumns';
import { summarizeChannels } from './channelSummary';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './eventSelection';
import {
  CharacterChipGrid,
  type CharacterAvailability,
  type CharacterRef,
} from './CharacterChipGrid';

export interface AggregateRowProps {
  label: string;
  labelAccessory?: ReactNode;
  /** `type` rows (an EVE notification type) sit under their event, quieter. */
  tone?: 'event' | 'type';
  /** Every Character, active one first: a broadcast schedules its sync off the first. */
  characters: readonly CharacterRef[];
  availability: (characterId: number) => CharacterAvailability;
  readValue: (characterId: number, channel: NotificationChannel) => boolean;
  /** Broadcast to the Characters this row applies to. */
  onToggleAll: (applicableIds: number[], channel: NotificationChannel) => void;
  onToggleOne: (characterId: number, channel: NotificationChannel) => void;
  browserBlocked: boolean;
  /** A search that names Characters narrows the chips to them; null shows all. */
  visibleCharacterIds: ReadonlySet<number> | null;
  /** Open the row because a search asked for it. Honoured on desktop only: a phone never opens sheets on its own. */
  forceExpanded: boolean;
  isDesktop: boolean;
  /** Hints and per-Character controls shown under the chips when open. */
  children?: ReactNode;
}

export function AggregateRow({
  label,
  labelAccessory,
  tone = 'event',
  characters,
  availability,
  readValue,
  onToggleAll,
  onToggleOne,
  browserBlocked,
  visibleCharacterIds,
  forceExpanded,
  isDesktop,
  children,
}: AggregateRowProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const open = opened || (forceExpanded && isDesktop);

  const applicableIds = characters
    .filter((character) => availability(character.characterId).enabled)
    .map((character) => character.characterId);
  const summary = summarizeChannels(applicableIds, readValue);
  const differing = new Set(summary.differingIds);
  const shown =
    visibleCharacterIds === null
      ? characters
      : characters.filter((character) => visibleCharacterIds.has(character.characterId));

  const body = (
    <div className="space-y-3">
      <CharacterChipGrid
        label={label}
        characters={shown}
        differingIds={differing}
        availability={availability}
        readValue={readValue}
        onToggle={onToggleOne}
        browserBlocked={browserBlocked}
      />
      {children}
    </div>
  );

  const summaryText =
    characters.length < 2
      ? null
      : applicableIds.length === 0
        ? t('settings.notifications.summary.unavailable')
        : summary.alike
          ? t('settings.notifications.summary.alike', { count: applicableIds.length })
          : t('settings.notifications.summary.differ', { count: summary.differingIds.length });

  return (
    <li>
      <div
        className={cx(
          'flex items-center justify-between gap-3 px-3 text-xs hover:bg-panel-2',
          open && isDesktop && 'bg-panel-2'
        )}
      >
        {/* The checkboxes are siblings of the toggle, not inside its <button>: an interactive control inside a button is invalid HTML and folds both names together. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup={isDesktop ? undefined : 'dialog'}
            onClick={() => setOpened((value) => !value)}
            className={cx(
              'flex min-h-11 min-w-0 items-center gap-1.5 py-2 text-left md:min-h-9',
              tone === 'type' ? 'text-text-dim' : 'text-text',
              interactiveClassName,
              focusRingInsetClassName
            )}
          >
            <Caret expanded={open && isDesktop} />
            <span className="min-w-0 truncate">{label}</span>
          </button>
          {labelAccessory}
          {summaryText !== null && (
            <span
              className={cx(
                'ml-6 shrink-0 rounded-xs border px-1.5 py-0.5 font-mono text-[0.6875rem] md:ml-auto',
                applicableIds.length > 0 && !summary.alike
                  ? 'border-warning/60 text-warning'
                  : 'border-line text-text-dim'
              )}
            >
              {summaryText}
            </span>
          )}
        </div>
        <div className={CHANNEL_COLUMNS}>
          {NOTIFICATION_CHANNELS.map((channel) => (
            <SelectionCheckbox
              key={channel}
              state={summary.state[channel]}
              disabled={applicableIds.length === 0 || (channel === 'browser' && browserBlocked)}
              onToggle={() => onToggleAll(applicableIds, channel)}
              label={t(`settings.notifications.toggleAllCharactersLabel.${channel}`, {
                event: label,
              })}
            />
          ))}
        </div>
      </div>
      {open && isDesktop && (
        <div className="border-t border-line bg-panel-2 px-3 py-3 md:pl-8">{body}</div>
      )}
      {!isDesktop && (
        <Modal open={open} onClose={() => setOpened(false)} title={label} placement="sheet-full">
          {body}
        </Modal>
      )}
    </li>
  );
}
