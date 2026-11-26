import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Caret, Modal } from '@/components/ui';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { EVENT_ROW_GRID, DEVICE_CELL, ALERTS_CELL } from './ChannelColumns';
import { ChannelOffTip } from './ChannelOffTip';
import type { ChannelOffMap } from './channelOff';
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
  tone?: 'event' | 'type';
  characters: readonly CharacterRef[];
  availability: (characterId: number) => CharacterAvailability;
  readValue: (characterId: number, channel: NotificationChannel) => boolean;
  onToggleAll: (applicableIds: number[], channel: NotificationChannel) => void;
  onToggleOne: (characterId: number, channel: NotificationChannel) => void | Promise<void>;
  channelOff: ChannelOffMap;
  visibleCharacterIds: ReadonlySet<number> | null;
  forceExpanded: boolean;
  isDesktop: boolean;
  notes?: ReactNode;
  omitUnavailableNote?: boolean;
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
  channelOff,
  visibleCharacterIds,
  forceExpanded,
  isDesktop,
  notes,
  warnAhead,
  omitUnavailableNote = false,
}: AggregateRowProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const open = chosen ?? (forceExpanded && isDesktop);
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
      if (channelOff[channel] !== null) continue;
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
        channelOff={channelOff}
      />
    </div>
  );

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
        <div className="flex min-w-0 items-start gap-1.5 md:col-start-1 md:row-start-1">
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup={isDesktop ? undefined : 'dialog'}
            onClick={() => setChosen(!open)}
            className={cx(
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
        <div className="flex flex-wrap items-center gap-x-5 pl-6 md:contents">
          {NOTIFICATION_CHANNELS.map((channel, index) => (
            <div key={channel} className={index === 0 ? DEVICE_CELL : ALERTS_CELL}>
              <ChannelOffTip reason={channelOff[channel]}>
                <SelectionCheckbox
                  state={summary.state[channel]}
                  disabled={applicableIds.length === 0 || channelOff[channel] !== null}
                  onToggle={() => onToggleAll(applicableIds, channel)}
                  label={t(`settings.notifications.toggleAllCharactersLabel.${channel}`, {
                    event: label,
                  })}
                  caption={t(`settings.notifications.column.${channel}`)}
                  captionClassName="md:hidden"
                />
              </ChannelOffTip>
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
