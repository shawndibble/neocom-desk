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
  /** The row's own focus anchor — the caller moves focus here when a neighboring row disappears. */
  toggleRef?: (el: HTMLButtonElement | null) => void;
  /** Per-entry focus anchor for the dismiss button, keyed by `entry.id` — same reason as `toggleRef`. */
  entryDismissRef?: (entryId: string, el: HTMLButtonElement | null) => void;
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
  toggleRef,
  entryDismissRef,
}: AlertGroupRowProps) {
  const { t } = useTranslation();

  return (
    <li className={group.muted ? 'text-text-dim' : undefined}>
      <div className="flex min-h-11 items-center gap-1 px-3 sm:gap-2 md:min-h-9">
        {/*
          One line, always — the label truncates instead of reflowing.
          Wrapping the label onto its own row used to be unconditional (a
          `w-full` on the third flex child), which meant even "New Mail"
          dropped to a second line it never needed.

          The row used to also carry "newest Xh ago" beside the label, which
          was one thing too many at phone width: on a longer label ("New
          Calendar Event") it left no room and the label itself started
          ellipsizing. Dropping it costs nothing a reader can't get by
          opening the type — every fire inside already carries its own age.
        */}
        <button
          ref={toggleRef}
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
              dismissRef={entryDismissRef ? (el) => entryDismissRef(entry.id, el) : undefined}
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
  dismissRef,
}: {
  entry: NotificationFeedRecord;
  /** Null on a one-Character device — see `showCharacter`. */
  name: string | null;
  onDismiss: () => void;
  dismissRef?: (el: HTMLButtonElement | null) => void;
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

      One name node, one time node, at every width — never a phone copy and a
      pointer copy of either, each hidden at the other width by a responsive
      class. That pair used to exist for the portrait/name switch this row no
      longer makes, and a screen reader (or a query in a test) has no width to
      go by: it would find both, which is exactly how a name ends up
      announced twice, or a device with a single Character silently ends up
      wrong for want of the copy that should have been removed. The name is a
      pill (not plain text) since the body already says the rest of the
      sentence via `dedupeCharacterName`, which strips the name itself.

      `order` alone moves the *same* elements between the two layouts a phone
      and a pointer need — the name pill and age share a line above the body
      on a phone (`order-1`/`order-2`, body `basis-full` so it always breaks
      onto the next line), then rejoin the body's own line from `sm` up
      (reordered back, `basis-auto`). Two rendered copies of either would
      solve the same layout problem but reintroduce the bug above; `order`
      repositions one.

      The body is never clamped: `line-clamp-2` used to share an element with
      this row's own vertical padding, and `overflow: hidden` clips at the
      *padding* box — a sliver of a clipped third line rendered inside that
      padding, under the row's border, on anything long enough to need it.
      Letting it wrap to full height on a phone removes the clamp and the
      clip both; `sm:truncate` keeps it to one line from `sm` up, where the
      row has the width to spare instead.
    */
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 last:border-b-0 sm:flex-nowrap">
      {name !== null && (
        <span className="order-1 max-w-24 shrink-0 truncate rounded-xs border border-line bg-panel-2 px-1 py-0.5 text-[0.625rem] font-medium text-text-dim sm:order-2 sm:max-w-none">
          {name}
        </span>
      )}
      <time
        dateTime={firedAt.toISOString()}
        title={formatTimestamp(firedAt, timeZone)}
        className="order-2 ml-auto shrink-0 text-[0.6875rem] tabular-nums text-text-dim sm:order-3 sm:ml-0 sm:w-16 sm:text-right"
      >
        {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
        {formatAge(Math.max(0, Date.now() - entry.firedAt), t)}
      </time>
      <Link
        to={notificationUrlForSubject(entry.eventId, entry.subjectId ?? entry.typeId)}
        className="order-4 min-w-0 basis-full rounded-xs text-xs text-text-dim hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:order-1 sm:flex-1 sm:basis-auto sm:truncate"
      >
        {body}
      </Link>
      <IconButton
        ref={dismissRef}
        icon={<Icon.Close />}
        label={t('alerts.dismissOne', { title: entry.title })}
        variant="plain"
        size="sm"
        onClick={onDismiss}
        className="order-3 sm:order-4"
      />
    </li>
  );
}
