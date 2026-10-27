/**
 * One row of a Topic's event table: the full event name, two tri-state
 * checkboxes that speak for every Character the row applies to, its warn-ahead
 * control, and an "All n alike" / "n differs" note. The name opens the
 * per-Character view (inline from `md` up, a bottom sheet on a phone) so the
 * odd ones out can be fixed one by one or with "Apply to all".
 *
 * From `md` up the row is one grid line (`EVENT_ROW_GRID`). On a phone the
 * name takes the whole first line, never truncated, and the Device and Alerts
 * toggles sit on a second line with their words beside them.
 *
 * Used for Notification Events and, with the same shape, for each EVE
 * notification type. The caller supplies how to read and write one value, so
 * this holds no preference logic of its own.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Caret, Modal } from '@/components/ui';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { EVENT_ROW_GRID, DEVICE_CELL, ALERTS_CELL } from './ChannelColumns';
import { applyToAllFlips, summarizeChannels } from './channelSummary';
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
  /** Awaited by "Apply to all": each write reads the store, so they must not overlap. */
  onToggleOne: (characterId: number, channel: NotificationChannel) => void | Promise<void>;
  browserBlocked: boolean;
  /** A search that names Characters narrows the chips to them; null shows all. */
  visibleCharacterIds: ReadonlySet<number> | null;
  /** Open the row because a search asked for it. Honoured on desktop only: a phone never opens sheets on its own. The user can still close it. */
  forceExpanded: boolean;
  isDesktop: boolean;
  /** Always visible under the row, open or not: delivery caveats and who has not granted a Permission. */
  notes?: ReactNode;
  /** Leave out "None can use this": a Topic-level line already says so. */
  omitUnavailableNote?: boolean;
  /** The event's warn-ahead control: a button in the row, its body opening under the row. */
  warnAhead?: { label: string; body: ReactNode };
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
  notes,
  warnAhead,
  omitUnavailableNote = false,
}: AggregateRowProps) {
  const { t } = useTranslation();
  // null until the user toggles the row: then their choice wins over the search's.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const open = chosen ?? (forceExpanded && isDesktop);
  // The control goes when no Character has the event on; coming back must not reopen it unasked.
  if (warnAhead === undefined && warnOpen) setWarnOpen(false);

  const applicableIds = characters
    .filter((character) => availability(character.characterId).enabled)
    .map((character) => character.characterId);
  const summary = summarizeChannels(applicableIds, readValue);
  const differing = new Set(summary.differingIds);
  const shown =
    visibleCharacterIds === null
      ? characters
      : characters.filter((character) => visibleCharacterIds.has(character.characterId));

  async function applyToAll() {
    const flips = applyToAllFlips(applicableIds, readValue);
    for (const channel of NOTIFICATION_CHANNELS) {
      // The Device boxes are disabled while the browser is blocked; Apply must not write behind them.
      if (channel === 'browser' && browserBlocked) continue;
      for (const characterId of flips[channel]) await onToggleOne(characterId, channel);
    }
  }

  const body = (
    <div className="space-y-3">
      {!summary.alike && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => void applyToAll()}
            aria-label={t('settings.notifications.applyToAllLabel', { event: label })}
          >
            {t('settings.notifications.applyToAll')}
          </Button>
          <span className="text-[0.6875rem] text-text-dim">
            {t('settings.notifications.applyToAllHint')}
          </span>
        </div>
      )}
      <CharacterChipGrid
        label={label}
        characters={shown}
        differingIds={differing}
        availability={availability}
        readValue={readValue}
        onToggle={onToggleOne}
        browserBlocked={browserBlocked}
      />
    </div>
  );

  // One Character has nothing to compare, but a row nobody can use still says so.
  const summaryText =
    applicableIds.length === 0
      ? omitUnavailableNote
        ? null
        : t('settings.notifications.summary.unavailable')
      : characters.length < 2
        ? null
        : applicableIds.length < characters.length && summary.alike
          ? t('settings.notifications.summary.partial', {
              count: applicableIds.length,
              total: characters.length,
            })
          : summary.alike
            ? t('settings.notifications.summary.alike', { count: applicableIds.length })
            : t('settings.notifications.summary.differ', { count: summary.differingIds.length });

  return (
    <li>
      <div
        className={cx(
          'px-3 text-xs hover:bg-panel-2',
          EVENT_ROW_GRID,
          open && isDesktop && 'bg-panel-2'
        )}
      >
        {/* The checkboxes are siblings of the toggle, not inside its <button>: an interactive control inside a button is invalid HTML and folds both names together. */}
        <div className="flex min-w-0 items-start gap-1.5 md:col-start-1 md:row-start-1">
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup={isDesktop ? undefined : 'dialog'}
            onClick={() => setChosen(!open)}
            className={cx(
              // The name wraps: a truncated name hides which event the row is.
              'flex min-h-9 min-w-0 items-center gap-1.5 py-2 text-left',
              tone === 'type' ? 'text-text-dim' : 'text-text',
              interactiveClassName,
              focusRingInsetClassName
            )}
          >
            <Caret expanded={open && isDesktop} />
            <span data-event-name className="min-w-0 break-words">
              {label}
            </span>
          </button>
          {labelAccessory !== undefined && <span className="py-3 md:py-2">{labelAccessory}</span>}
        </div>
        {/* `contents` from `md`: each cell is then its own grid item. */}
        <div className="flex flex-wrap items-center gap-x-5 pl-6 md:contents">
          {NOTIFICATION_CHANNELS.map((channel, index) => (
            <div key={channel} className={index === 0 ? DEVICE_CELL : ALERTS_CELL}>
              <SelectionCheckbox
                state={summary.state[channel]}
                disabled={applicableIds.length === 0 || (channel === 'browser' && browserBlocked)}
                onToggle={() => onToggleAll(applicableIds, channel)}
                label={t(`settings.notifications.toggleAllCharactersLabel.${channel}`, {
                  event: label,
                })}
                caption={t(`settings.notifications.column.${channel}`)}
                captionClassName="md:hidden"
              />
            </div>
          ))}
          {summaryText !== null && (
            <span
              className={cx(
                'ml-auto shrink-0 rounded-xs border px-1.5 py-0.5 font-mono text-[0.6875rem] md:col-start-5 md:row-start-1 md:ml-0 md:justify-self-start',
                applicableIds.length > 0 && !summary.alike
                  ? 'border-warning/60 text-warning'
                  : 'border-line text-text-dim'
              )}
            >
              {summaryText}
            </span>
          )}
        </div>
        {warnAhead !== undefined && (
          <div className="pl-6 md:col-start-4 md:row-start-1 md:pl-0">
            <button
              type="button"
              aria-expanded={warnOpen}
              onClick={() => setWarnOpen((value) => !value)}
              className={cx(
                'flex min-h-9 items-center gap-1.5 py-1 text-left text-[0.6875rem] text-text-dim',
                interactiveClassName,
                focusRingInsetClassName
              )}
            >
              <Caret expanded={warnOpen} />
              <span className="min-w-0">{warnAhead.label}</span>
            </button>
          </div>
        )}
      </div>
      {notes !== undefined && <div className="space-y-1 px-3 pt-0.5 pb-2 pl-8">{notes}</div>}
      {warnOpen && warnAhead !== undefined && (
        <div className="border-t border-line bg-panel-2 px-3 py-3 md:pl-8">{warnAhead.body}</div>
      )}
      {open && isDesktop && (
        <div className="border-t border-line bg-panel-2 px-3 py-3 md:pl-8">{body}</div>
      )}
      {!isDesktop && (
        <Modal open={open} onClose={() => setChosen(false)} title={label} placement="sheet-full">
          {body}
        </Modal>
      )}
    </li>
  );
}
