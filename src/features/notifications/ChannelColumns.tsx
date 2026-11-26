import { HintText } from '@/components/ui/HintText';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_CHANNELS } from './eventSelection';
import { NO_CHANNEL_OFF, type ChannelOffMap } from './channelOff';

export const EVENT_ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1fr)_4.25rem_4.25rem_minmax(8rem,12rem)_7rem] md:items-center md:gap-x-3';

export const DEVICE_CELL = 'md:col-start-2 md:row-start-1 md:justify-self-center';
export const ALERTS_CELL = 'md:col-start-3 md:row-start-1 md:justify-self-center';

export function ChannelColumnHeadings({
  pinned = false,
  channelOff = NO_CHANNEL_OFF,
}: {
  pinned?: boolean;
  channelOff?: ChannelOffMap;
}) {
  const { t } = useTranslation();
  const caption =
    'text-[0.6875rem] leading-tight font-semibold tracking-widest text-text-dim uppercase';

  return (
    <div
      className={`hidden border-b border-line px-3 py-1.5 ${EVENT_ROW_GRID}${
        pinned ? ' md:sticky md:top-0 md:z-10 md:bg-panel-2' : ''
      }`}
    >
      <span className={caption}>{t('settings.notifications.columnEvent')}</span>
      {NOTIFICATION_CHANNELS.map((channel) => (
        <HintText
          key={channel}
          content={t(`settings.notifications.columnHint.${channel}`)}
          className={`${caption} justify-self-center${channelOff[channel] === null ? '' : ' opacity-60'}`}
        >
          {t(`settings.notifications.column.${channel}`)}
        </HintText>
      ))}
      <span className={caption}>{t('settings.notifications.columnWarnAhead')}</span>
      <span className={caption}>{t('settings.notifications.columnCharacters')}</span>
    </div>
  );
}
