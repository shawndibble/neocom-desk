/**
 * One notification type's row in the alerts panel (docs/design/alerts-panel-ux-research.md §3).
 *
 * The row is the click target: a single-fire group goes to its View destination,
 * a group of many expands, and the caret and count are the expand-state cue
 * rather than a second control. The target is a cover button (the pattern
 * `CharacterSwitcher` uses) laid under the row, so the trailing controls, the
 * Acknowledge button and the age tooltip sit above it instead of nesting in it.
 *
 * The trailing cluster is a visible `×` (dismiss, always at full strength: it
 * has no second door) and a `⋮` holding Snooze, Stop these alerts and the
 * notification settings. The `⋮` dims at rest with a pointer because the same
 * menu opens on right-click and touch-and-hold of the row; it is always full on
 * touch. A danger row has neither: Acknowledge stays a visible, worded button.
 *
 * Presentational: every action is a callback, and the fires of an opened group
 * arrive as `children`.
 */
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

/** The nav icons the app already owns, one per topic chip; `NavAlerts` for a group with none. */
const TOPIC_GLYPH: Record<AlertTopic, typeof Icon.NavAlerts> = {
  structures: Icon.NavCorp,
  market: Icon.NavMarket,
  industry: Icon.NavIndustry,
  skills: Icon.NavSkills,
  mail: Icon.NavMail,
  other: Icon.NavAlerts,
};

/**
 * The `⋮` at rest: 60% of `text-dim` is 3.3:1 on `bg-panel`, which clears WCAG
 * 1.4.11's 3:1 for a control (45% measured 2.4:1 and did not). Full on hover or
 * focus in the row, while its own menu is open, and always on touch and
 * `hover:none`, where there is no hover to reveal it.
 */
const MORE_ACTIONS_CLASS = cx(
  'opacity-60 motion-safe:transition-opacity',
  'group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100',
  'touch:opacity-100 [@media(hover:none)]:opacity-100'
);

export interface AlertGroupRowProps {
  group: AlertTypeGroup;
  /** The group's title, already translated. */
  label: string;
  now: number;
  /** How many of its fires are listed; absent means collapsed. */
  shown: number | undefined;
  /** Sliding out after a dismiss; the row is inert and collapses to nothing. */
  leaving: boolean;
  buttonSize: 'sm' | 'md';
  /** A single-fire group: go to View. */
  onOpen: () => void;
  /** A group of many: expand or collapse its fires. */
  onToggle: () => void;
  /** The `×`: dismiss, with Undo. */
  onDismiss: () => void;
  /** A danger group's worded button. */
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
  /** An item that removes the row: focus is already headed for a neighbour, so the menu must not take it back. */
  const acted = useRef(false);
  /** The part that travels under a finger, and the same part the leaving slide moves. */
  const slide = useRef<HTMLDivElement>(null);
  const danger = group.severity === 'critical';
  const many = group.count > 1;
  const topic = alertTopic(group.key);
  const Glyph = TOPIC_GLYPH[topic];
  const fired = new Date(group.newestFiredAt);

  // Touch and pen only, and never on a danger row, which needs a deliberate act
  // (§3f). Nor while the group is open: the fires render inside the part that
  // travels, so a swipe begun on one fire would carry the whole group out and
  // dismiss every fire in it. Each fire already has its own ×.
  const swipe = useRowSwipe(slide, onDismiss, !danger && !leaving && shown === undefined);

  // The hook leaves a committed row translated out. Undo puts the same row back,
  // so clear its inline transform or it returns already off-screen.
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
        // Real space between the two: a destructive × beside a ⋮ is a mis-tap hazard (§6c), and
        // the hit areas must not touch (WCAG 2.5.8).
        <span className="relative flex shrink-0 items-center gap-3 touch:gap-4">
          <IconButton
            icon={<Icon.Close />}
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
        {/* The swipe viewport: the track sits still at the inline end while the row travels over it. */}
        <div className={cx(!danger && 'relative overflow-hidden')}>
          {!danger && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 flex w-20 items-center justify-center bg-panel-2 text-text-dim ltr:right-0 rtl:left-0"
            >
              <Icon.Close />
            </div>
          )}
          <div
            ref={slide}
            {...swipe}
            className={cx(
              'relative border-b border-line motion-safe:transition-[transform,opacity] motion-safe:duration-150 motion-safe:ease-in',
              danger ? 'border-l-2 border-l-danger bg-danger/5' : 'bg-panel',
              // Toward the inline start, the same way the phone swipe goes.
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
