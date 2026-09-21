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
import { Caret, IconButton, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { NotificationFeedRecord } from '@/db';
import type { DisplayAlertGroup } from './alertsFilter';
import { dedupeCharacterName } from './notificationBody';
import { notificationUrlForSubject } from './notificationOptions';

export interface AlertGroupRowProps {
  group: DisplayAlertGroup;
  expanded: boolean;
  onToggle: () => void;
  onDismissGroup: () => void;
  onToggleMute: () => void;
  nameById: ReadonlyMap<number, string>;
  /**
   * Whether a fire needs to say which Character it belongs to.
   *
   * False on a one-Character device, where the answer is the same on every row
   * and the name is repetition the body copy is paying for. It is not a
   * question of whether *this type* spans one Character — a type that only ever
   * fired for an alt is exactly the case this page exists to surface — but of
   * whether the device has more than one Character at all.
   */
  showCharacter: boolean;
  /** The whole row, not its id: the caller has to know which Character to sync the dismissal under. */
  onDismissEntry: (entry: NotificationFeedRecord) => void;
}

export function AlertGroupRow({
  group,
  expanded,
  onToggle,
  onDismissGroup,
  onToggleMute,
  nameById,
  showCharacter,
  onDismissEntry,
}: AlertGroupRowProps) {
  const { t } = useTranslation();

  return (
    <li className={group.muted ? 'text-text-dim' : undefined}>
      <div className="flex min-h-11 items-center gap-1 px-3 sm:gap-2 md:min-h-9">
        {/*
          One line, always — the label truncates instead of reflowing.
          Wrapping the label onto its own row used to be unconditional (a
          `w-full` on the third flex child), which meant even "New Mail"
          dropped to a second line it never needed. Real `alerts.byType`
          labels ("New Calendar Event", "Sell Order Filled", …) fit this row
          at 390px with room to spare; the rare one that doesn't just
          ellipsizes, the same as every other truncated label in the app.
        */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xs py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <Caret expanded={expanded} />
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums">
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
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">
            {t('alerts.newest', {
              // eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label
              age: formatAge(Math.max(0, Date.now() - group.newestFiredAt), t),
            })}
          </span>
        </button>
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
              name={
                showCharacter
                  ? (nameById.get(entry.characterId) ?? String(entry.characterId))
                  : null
              }
              onDismiss={() => onDismissEntry(entry)}
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
  /** Null on a one-Character device — see `showCharacter`. */
  name: string | null;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const firedAt = new Date(entry.firedAt);
  const body = dedupeCharacterName(entry.body, name);

  return (
    /*
      Flush with the type rows above rather than indented under them. The
      indent bought a visual hierarchy the panel's own fill and the disclosure
      state already carry, and it cost the body copy — the one thing on this
      row that is worth reading — nine characters of a phone's width.

      Name + age share their own line above the body on a phone, where the
      name is a pill (not plain text) since the body already says the rest of
      the sentence — `dedupeCharacterName` strips only the name itself. From
      `sm` up there's room for all of it on one line, so the pill rejoins the
      body's row and the phone-only meta line disappears.

      The body is never clamped: `line-clamp-2` used to share an element with
      this row's own vertical padding, and `overflow: hidden` clips at the
      *padding* box — a sliver of a clipped third line rendered inside that
      padding, under the row's border, on anything long enough to need it.
      Letting the body wrap to full height removes the clamp and the clip
      both; `sm:truncate` still keeps it to one line from `sm` up, where the
      row has the width to spare instead.
    */
    <li className="flex flex-col gap-1 border-b border-line px-3 py-1.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center justify-between gap-2 sm:hidden">
        {name !== null && (
          <span className="min-w-0 truncate rounded-full bg-panel px-2 py-0.5 text-[0.625rem] font-medium text-text-dim">
            {name}
          </span>
        )}
        <time
          dateTime={firedAt.toISOString()}
          title={formatTimestamp(firedAt, timeZone)}
          className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim"
        >
          {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
          {formatAge(Math.max(0, Date.now() - entry.firedAt), t)}
        </time>
      </div>
      <Link
        to={notificationUrlForSubject(entry.eventId, entry.subjectId ?? entry.typeId)}
        className="min-w-0 flex-1 rounded-xs text-xs text-text-dim hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:truncate"
      >
        {body}
      </Link>
      {name !== null && (
        <span className="hidden shrink-0 truncate rounded-full bg-panel px-2 py-0.5 text-[0.625rem] font-medium text-text-dim sm:inline">
          {name}
        </span>
      )}
      <time
        dateTime={firedAt.toISOString()}
        title={formatTimestamp(firedAt, timeZone)}
        className="hidden shrink-0 text-right text-[0.6875rem] tabular-nums text-text-dim sm:inline sm:w-16"
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
        className="self-end sm:self-auto"
      />
    </li>
  );
}
