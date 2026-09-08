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
import { notificationUrlFor } from './notificationOptions';

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
  onDismissEntry: (id: string) => void;
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
      {/*
        `items-start` below `sm`, because the row is two lines there and the
        two controls belong beside the first of them, not floating between the
        pair. From `sm` up there is only one line and centring is the same
        thing.
      */}
      <div className="flex min-h-11 items-start gap-1 px-3 sm:items-center sm:gap-2 md:min-h-9">
        {/*
          The disclosure button owns the whole label, so the row's big target
          is the one that expands it. `Disclosure` is not reused here: it puts
          its content inside the button's own container, and these rows need
          the fires to escape the row's padding and sit flush in the panel.

          It WRAPS below `sm` rather than stacking with `flex-col`, and the
          three children carry `order` so the wrap lands where it should: the
          count cluster and the age share the first line, and the type name —
          the one thing here of unpredictable length — takes the whole of the
          second. Written this way the age exists once, inside the button, at
          both widths; the obvious alternative (a phone copy and a pointer
          copy, each hidden at the other width) would put the same fact in the
          DOM twice and let the two drift.

          The name still cannot reach under the two controls to its right —
          they are siblings of the button, and nothing can be a flex item and
          a button's child at once — but it goes from sharing a line with
          everything to owning one, which is most of the room back.
        */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 rounded-xs py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:flex-nowrap"
        >
          <span className="order-1 flex shrink-0 items-center gap-3">
            <Caret expanded={expanded} />
            <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums sm:w-14">
              <SeverityIcon severity={group.severity} />
              {group.count}
            </span>
          </span>
          <span className="order-3 w-full min-w-0 truncate text-sm sm:order-2 sm:w-auto sm:flex-1">
            {group.label}
            {group.muted && (
              <span className="ml-2 text-[0.6875rem] tracking-widest text-text-dim uppercase">
                {t('alerts.muted')}
              </span>
            )}
          </span>
          <span className="order-2 ml-auto shrink-0 text-[0.6875rem] tabular-nums text-text-dim sm:order-3 sm:ml-0">
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
  /** Null on a one-Character device — see `showCharacter`. */
  name: string | null;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const firedAt = new Date(entry.firedAt);

  return (
    /*
      Flush with the type rows above rather than indented under them. The
      indent bought a visual hierarchy the panel's own fill and the disclosure
      state already carry, and it cost the body copy — the one thing on this
      row that is worth reading — nine characters of a phone's width.
    */
    <li className="flex min-h-11 items-center gap-3 border-b border-line px-3 last:border-b-0 md:min-h-9">
      {/* Same destination a tap on the OS notification would reach — the feed
          and the browser channel deliver the same fires, so they must land in
          the same place (`notificationOptions.ts`). */}
      {/*
        Two lines on a phone, one from `sm` up.

        Removing the indent and the portrait bought this row about sixty
        pixels, and on a 390px screen that still only reaches twenty-odd
        characters of "Mero Otichoda's extractor on Efa I expires in under 12
        hours." — the body is the whole reason to expand a type, and a body cut
        off at "Mero Otichoda's extr…" says nothing the collapsed row did not.
        A second line is the room it actually needs. Clamped at two rather than
        left to run, so a long body cannot turn one fire into a paragraph and
        push the rest of the list off the screen.
      */}
      <Link
        to={notificationUrlFor(entry.eventId)}
        className="line-clamp-2 min-w-0 flex-1 rounded-xs py-1.5 text-xs text-text-dim hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:line-clamp-none sm:truncate"
      >
        {entry.body}
      </Link>
      {/*
        The name, at every width and on its own — no portrait.

        The two used to be a pair with the name hidden below `sm`, which made
        the portrait the sole identification on a phone and earned it the alt
        text. With the portrait gone the name has to be visible everywhere, or
        the phone would say nothing at all about whose alert this is — which is
        the fact this page exists to surface (an alt's alerts used to be
        invisible until you switched to it).

        `min-w-0 truncate` without `shrink-0`: when the row is tight the name
        gives way before the body does, because the body is what the reader
        came for.
      */}
      {name !== null && (
        <span className="min-w-0 truncate text-[0.6875rem] text-text-dim">{name}</span>
      )}
      <time
        dateTime={firedAt.toISOString()}
        title={formatTimestamp(firedAt, timeZone)}
        // Auto-width on a phone, where "2h ago" paying for "just now" is
        // room the body could have had; the tidy aligned column returns at
        // `sm`, where there is width to spend on it.
        className="shrink-0 text-right text-[0.6875rem] tabular-nums text-text-dim sm:w-16"
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
