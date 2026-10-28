/**
 * One row of the event-first Notifications page, opened up: every Character
 * as a chip with its own Device and Alerts checkboxes, so the Characters that
 * differ from the rest can be fixed one by one. Characters the event cannot
 * apply to (a missing scope or corp role) stay listed, dimmed, with the same
 * explanation the old per-Character section gave.
 */
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { ChannelCheckbox } from './ChannelCheckbox';
import type { ChannelOffMap } from './channelOff';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './eventSelection';

export interface CharacterRef {
  characterId: number;
  name: string;
}

export interface CharacterAvailability {
  enabled: boolean;
  reason: 'scope' | 'capability' | null;
  /** Names the declined Permission in the scope tooltip (issue #1525). */
  permissionLabel?: string;
}

interface CharacterChipGridProps {
  /** What the checkboxes' accessible names say they toggle, e.g. "New Mail". */
  label: string;
  characters: readonly CharacterRef[];
  differingIds: ReadonlySet<number>;
  availability: (characterId: number) => CharacterAvailability;
  readValue: (characterId: number, channel: NotificationChannel) => boolean;
  onToggle: (characterId: number, channel: NotificationChannel) => void | Promise<void>;
  channelOff: ChannelOffMap;
}

export function CharacterChipGrid({
  label,
  characters,
  differingIds,
  availability,
  readValue,
  onToggle,
  channelOff,
}: CharacterChipGridProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <p className="text-[0.6875rem] text-text-dim">{t('settings.notifications.chipLegend')}</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {characters.map((character) => {
          const state = availability(character.characterId);
          const differs = differingIds.has(character.characterId);
          return (
            <li
              key={character.characterId}
              className={cx(
                'flex items-center gap-2 rounded-xs border px-2 py-1 text-xs',
                differs ? 'border-warning/60 bg-warning/10' : 'border-line bg-panel',
                !state.enabled && 'opacity-60'
              )}
            >
              <CharacterAvatar characterId={character.characterId} size="sm" loading="lazy" />
              <span className="min-w-0 flex-1 truncate text-text">{character.name}</span>
              {differs && (
                // Colour is never the only signal: a mark and, for a screen reader, words.
                <span className="shrink-0 text-warning">
                  <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                  <span className="sr-only">{t('settings.notifications.chipDiffers')}</span>
                </span>
              )}
              {NOTIFICATION_CHANNELS.map((channel) => (
                <span key={channel} className="last:ml-1">
                  <ChannelCheckbox
                    channel={channel}
                    eventLabel={`${label}, ${character.name}`}
                    enabled={state.enabled}
                    channelOff={channelOff[channel]}
                    disabledReason={state.reason}
                    missingPermissionLabel={state.permissionLabel}
                    checked={readValue(character.characterId, channel)}
                    onToggle={() => onToggle(character.characterId, channel)}
                    caption={t(`settings.notifications.chipLetter.${channel}`)}
                  />
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
