/**
 * One notification *type* on the Alerts page: a count, a name, when it last
 * fired, and the two controls that act on the whole type.
 *
 * Expanding it reveals the individual fires — that is where the body copy and
 * the Character each one belongs to live. The collapsed row deliberately shows
 * neither: a type that fired 284 times has 284 different bodies, and picking
 * one to stand for the rest would be a lie about the other 283.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Caret, CharacterAvatar, IconButton, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { NotificationFeedRecord } from '@/db';
import type { DisplayAlertGroup } from './alertsFilter';
import { notificationUrlFor } from './notificationOptions';

export interface AlertGroupRowProps {
  group: DisplayAlertGroup;
  expanded: boolean;
  onToggle: () => void;
  onDismissGroup: () => void;
  onToggleMute: () => void;
  nameById: ReadonlyMap<number, string>;
  onDismissEntry: (id: string) => void;
}

export function AlertGroupRow({
  group,
  expanded,
  onToggle,
  onDismissGroup,
  onToggleMute,
  nameById,
  onDismissEntry,
}: AlertGroupRowProps) {
  const { t } = useTranslation();

  return (
    <li className={group.muted ? 'text-text-dim' : undefined}>
      <div className="flex min-h-11 items-center gap-2 px-3 md:min-h-9">
        {/*
          The disclosure button owns the whole label, so the row's big target
          is the one that expands it. `Disclosure` is not reused here: it puts
          its content inside the button's own container, and these rows need
          the fires to escape the row's padding and sit flush in the panel.
        */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xs py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <Caret expanded={expanded} />
          <span className="flex w-14 shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums">
            <SeverityIcon severity={group.severity} />
            {group.count}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {group.label}
            {group.muted && (
              <span className="ml-2 text-[0.6875rem] tracking-widest text-text-dim uppercase">
                {t('alerts.muted')}
              </span>
            )}
          </span>
        </button>
        <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">
          {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
          {t('alerts.newest', { age: formatAge(Math.max(0, Date.now() - group.newestFiredAt), t) })}
        </span>
        {/*
          One glyph, pressed or not, rather than two. `HideInFeed` is the feed
          channel's own icon; its opposite number in the Bell family belongs to
          the *browser* channel, which `icons.tsx` says must stay a pair. A
          toggle is the honest shape anyway — `aria-pressed` says which way it
          is set without needing a second symbol to learn.
        */}
        <IconButton
          icon={<Icon.HideInFeed />}
          pressed={group.muted}
          label={
            group.muted
              ? t('alerts.unmute', { type: group.label })
              : t('alerts.mute', { type: group.label })
          }
          tooltip={group.muted ? t('alerts.unmuteHint') : t('alerts.muteHint')}
          variant="plain"
          size="sm"
          onClick={onToggleMute}
        />
        <IconButton
          icon={<Icon.Close />}
          label={t('alerts.dismissType', { type: group.label })}
          variant="plain"
          size="sm"
          onClick={onDismissGroup}
        />
      </div>

      {expanded && (
        <ul className="border-t border-line bg-panel-2">
          {group.entries.map((entry) => (
            <AlertFireRow
              key={entry.id}
              entry={entry}
              name={nameById.get(entry.characterId) ?? String(entry.characterId)}
              onDismiss={() => onDismissEntry(entry.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function AlertFireRow({
  entry,
  name,
  onDismiss,
}: {
  entry: NotificationFeedRecord;
  name: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const firedAt = new Date(entry.firedAt);

  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-line pl-9 last:border-b-0 md:min-h-9">
      {/* Same destination a tap on the OS notification would reach — the feed
          and the browser channel deliver the same fires, so they must land in
          the same place (`notificationOptions.ts`). */}
      <Link
        to={notificationUrlFor(entry.eventId)}
        className="min-w-0 flex-1 truncate rounded-xs py-1.5 text-xs text-text-dim hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {entry.body}
      </Link>
      <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-text-dim">
        {/* Decorative: the name is right beside it (DESIGN.md §5). Below `sm`
            the name is hidden and the portrait is the only identification, so
            it takes the alt text there. */}
        <CharacterAvatar
          characterId={entry.characterId}
          size="sm"
          loading="lazy"
          className="size-5"
        />
        <span className="hidden sm:inline">{name}</span>
        {/* Only below `sm`, where the name above is hidden and the portrait is
            the sole identification — unconditional, it announced twice. */}
        <span className="sr-only sm:hidden">{name}</span>
      </span>
      <time
        dateTime={firedAt.toISOString()}
        title={formatTimestamp(firedAt, timeZone)}
        className="w-16 shrink-0 text-right text-[0.6875rem] tabular-nums text-text-dim"
      >
        {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
        {formatAge(Math.max(0, Date.now() - entry.firedAt), t)}
      </time>
      <IconButton
        icon={<Icon.Close />}
        label={t('alerts.dismissOne', { title: entry.title })}
        variant="plain"
        size="sm"
        onClick={onDismiss}
      />
    </li>
  );
}
