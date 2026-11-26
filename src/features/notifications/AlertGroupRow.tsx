import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Caret,
  Eyebrow,
  IconButton,
  MenuItem,
  RowActionsMenu,
  RowMoreActions,
  Tooltip,
} from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { useRowSwipe } from '@/components/ui/useRowSwipe';
import { cx } from '@/lib/cx';
import { formatAge } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
import { isSnoozable } from './dangerAlert';
import { alertTopic, type AlertTopic } from './alertTopic';
import type { AlertTypeGroup } from './alertGroups';

const TOPIC_GLYPH: Record<AlertTopic, typeof Icon.NavAlerts> = {
  structures: Icon.NavCorp,
  market: Icon.NavMarket,
  industry: Icon.NavIndustry,
  skills: Icon.NavSkills,
  mail: Icon.NavMail,
  calendar: Icon.NavCalendar,
  other: Icon.NavAlerts,
};

const MORE_ACTIONS_CLASS = cx(
  'opacity-60 motion-safe:transition-opacity',
  'group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100',
  'touch:opacity-100 [@media(hover:none)]:opacity-100'
);

export interface AlertGroupRowProps {
  group: AlertTypeGroup;
  label: string;
  now: number;
  shown: number | undefined;
  leaving: boolean;
  buttonSize: 'sm' | 'md';
  onOpen: () => void;
  onToggle: () => void;
  onDismiss: () => void;
  onAcknowledge: () => void;
  onSnooze: () => void;
  onStop: () => void;
  onSettings: () => void;
  children?: ReactNode;
}

export function AlertGroupRow({
  group,
  label,
  now,
  shown,
  leaving,
  buttonSize,
  onOpen,
  onToggle,
  onDismiss,
  onAcknowledge,
  onSnooze,
  onStop,
  onSettings,
  children,
}: AlertGroupRowProps) {
  const { t } = useTranslation();
  const acted = useRef(false);
  const slide = useRef<HTMLDivElement>(null);
  const danger = group.severity === 'critical';
  const many = group.count > 1;
  const topic = alertTopic(group.key);
  const Glyph = TOPIC_GLYPH[topic];
  const fired = new Date(group.newestFiredAt);

  const swipe = useRowSwipe(slide, onDismiss, !danger && !leaving && shown === undefined);

  useEffect(() => {
    if (leaving) return;
    const el = slide.current;
    if (!el) return;
    el.style.transform = '';
    el.style.transition = '';
  }, [leaving]);

  const choose = (action: () => void) => () => {
    acted.current = true;
    action();
  };

  const header = (
    <div
      className={cx(
        'group relative flex items-start gap-2.5 px-3.5 py-2.5',
        rowInteractiveClassName
      )}
    >
      <button
        type="button"
        data-row-cover
        aria-label={
          many
            ? t('alerts.panel.expandLabel', { title: label, count: group.count })
            : t('alerts.panel.viewLabel', { title: label })
        }
        aria-expanded={many ? shown !== undefined : undefined}
        onClick={many ? onToggle : onOpen}
        className={cx('absolute inset-0', focusRingInsetClassName)}
      />
      <Glyph
        aria-hidden="true"
        className="pointer-events-none mt-0.5 size-4 shrink-0 text-text-dim"
      />
      <div className="pointer-events-none min-w-0 flex-1">
        <Eyebrow as="p">
          {t(topic === 'other' ? 'alerts.panel.topicOther' : `alerts.panel.chip.${topic}`)}
          {' · '}
          <Tooltip content={t('alerts.panel.eveTime', { time: formatTimestamp(fired, 'UTC') })}>
            <time
              dateTime={fired.toISOString()}
              tabIndex={0}
              className="pointer-events-auto relative rounded-xs normal-case"
            >
              {formatAge(Math.max(0, now - group.newestFiredAt), t)}
            </time>
          </Tooltip>
        </Eyebrow>
        <p className="flex items-baseline gap-2 font-semibold">
          <span className="min-w-0 truncate">{label}</span>
          {many && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-normal text-text-dim">
              <Caret expanded={shown !== undefined} />
              {t('alerts.panel.groupCount', { count: group.count })}
            </span>
          )}
        </p>
        <p className="line-clamp-2 text-xs text-text-dim">{group.entries[0].body}</p>
        {danger && (
          <Button
            size={buttonSize}
            variant="primary"
            data-dismiss-target
            className="pointer-events-auto relative mt-1.5"
            aria-label={
              many
                ? t('alerts.panel.acknowledgeAllLabel', { title: label, count: group.count })
                : t('alerts.panel.acknowledgeLabel', { title: label })
            }
            onClick={onAcknowledge}
          >
            {many
              ? t('alerts.panel.acknowledgeAll', { count: group.count })
              : t('alerts.panel.acknowledge')}
          </Button>
        )}
      </div>
      {!danger && (
        <span className="relative -me-2 flex shrink-0 items-center gap-1 touch:gap-2">
          <IconButton
            icon={<Icon.Done />}
            label={
              many
                ? t('alerts.panel.dismissAllLabel', { title: label, count: group.count })
                : t('alerts.panel.dismissLabel', { title: label })
            }
            variant="plain"
            size="row"
            data-dismiss-target
            onClick={onDismiss}
          />
          <RowMoreActions className={MORE_ACTIONS_CLASS} />
        </span>
      )}
    </div>
  );

  return (
    <li
      data-group-key={group.key}
      inert={leaving}
      className={cx(
        'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out',
        leaving ? 'grid-rows-[0fr] motion-safe:delay-150' : 'grid-rows-[1fr]'
      )}
    >
      <div className={cx('min-h-0 min-w-0', leaving && 'overflow-hidden')}>
        <div className={cx(!danger && 'relative overflow-hidden')}>
          {!danger && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 flex w-20 items-center justify-center bg-panel-2 text-text-dim ltr:right-0 rtl:left-0"
            >
              <Icon.Done />
            </div>
          )}
          <div
            ref={slide}
            {...swipe}
            className={cx(
              'relative border-b border-line motion-safe:transition-[transform,opacity] motion-safe:duration-150 motion-safe:ease-in',
              danger ? 'border-l-2 border-l-danger bg-danger/5' : 'bg-panel',
              leaving && 'opacity-0 ltr:-translate-x-full rtl:translate-x-full'
            )}
          >
            {danger ? (
              header
            ) : (
              <RowActionsMenu
                name={label}
                onCloseAutoFocus={(event) => {
                  if (!acted.current) return;
                  acted.current = false;
                  event.preventDefault();
                }}
                items={
                  <>
                    {isSnoozable(group) && (
                      <MenuItem onSelect={choose(onSnooze)}>{t('alerts.panel.snooze')}</MenuItem>
                    )}
                    <MenuItem onSelect={choose(onStop)}>{t('alerts.panel.stopThese')}</MenuItem>
                    <MenuItem onSelect={choose(onSettings)}>{t('alerts.settings')}</MenuItem>
                  </>
                }
              >
                {header}
              </RowActionsMenu>
            )}
            {children}
          </div>
        </div>
      </div>
    </li>
  );
}
