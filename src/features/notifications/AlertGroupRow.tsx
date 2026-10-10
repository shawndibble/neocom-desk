/**
 * One notification *type* on the Alerts page: a count, a name, when it last
 * fired, and the two controls that act on the whole type.
 *
 * Expanding it reveals the individual fires — that is where the body copy and
 * the Character each one belongs to live. The collapsed row deliberately shows
 * neither: a type that fired 284 times has 284 different bodies, and picking
 * one to stand for the rest would be a lie about the other 283.
 */
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CharacterLink } from '@/features/entities';
import { HintText } from '@/components/ui/HintText';
import { Caret, IconButton, InfoTooltip, SEVERITY_LABEL, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { NotificationFeedRecord } from '@/db';
import type { DisplayAlertGroup } from './alertsFilter';
import { isProvisionalFill } from './feed';
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
  const timeZone = useTimeZone();
  const newestFiredAt = new Date(group.newestFiredAt);

  return (
    <li className={group.muted ? 'text-text-dim' : undefined}>
      <div className="flex min-h-11 items-center gap-1 px-3 sm:gap-2 md:min-h-9">
        {/*
          One line, always — the label truncates instead of reflowing.
          Wrapping the label onto its own row used to be unconditional (a
          `w-full` on the third flex child), which meant even "New Mail"
          dropped to a second line it never needed.

          The newest fire's age sits right-aligned before the mute control from
          `md` up only. At phone width it left no room on a longer label ("New
          Calendar Event") and the label itself started ellipsizing, so there
          it is left off — every fire inside already carries its own age.
          From `md` up the row has ~900px of empty space, and groups sort by
          severity first, so order alone doesn't say whether a type is new.
          The label still truncates first; the age is `shrink-0` at a fixed
          width so its right edge lines up on every row.
        */}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className={cx(
            'flex min-w-0 flex-1 items-center gap-3 rounded-xs py-1.5 text-left',
            interactiveClassName,
            focusRingInsetClassName
          )}
        >
          <Caret expanded={expanded} />
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums">
            <SeverityIcon severity={group.severity} label={t(SEVERITY_LABEL[group.severity])} />
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
        <time
          dateTime={newestFiredAt.toISOString()}
          className="hidden w-16 shrink-0 text-right text-[0.6875rem] tabular-nums text-text-dim md:block"
        >
          <HintText content={formatTimestamp(newestFiredAt, timeZone)}>
            {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
            {formatAge(Math.max(0, Date.now() - group.newestFiredAt), t)}
          </HintText>
        </time>
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
          {group.entries.map((entry) => {
            const characterName = nameById.get(entry.characterId) ?? String(entry.characterId);
            return (
              <AlertFireRow
                key={entry.id}
                entry={entry}
                characterName={characterName}
                pillName={showCharacter ? characterName : null}
                onDismiss={() => onDismissEntry(entry)}
                dismissRef={entryDismissRef ? (el) => entryDismissRef(entry.id, el) : undefined}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

function AlertFireRow({
  entry,
  characterName,
  pillName,
  onDismiss,
  dismissRef,
}: {
  entry: NotificationFeedRecord;
  /** Always the entry's Character — the body says it once whether or not the pill does. */
  characterName: string;
  /** Null on a one-Character device — see `showCharacter`. */
  pillName: string | null;
  onDismiss: () => void;
  dismissRef?: (el: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const firedAt = new Date(entry.firedAt);
  const body = dedupeCharacterName(entry.body, characterName);

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

      The body link is first in the DOM so it is the row's first Tab stop and
      the first thing read; `order-*` alone supplies the visual order above.

      The body is never clamped: `line-clamp-2` used to share an element with
      this row's own vertical padding, and `overflow: hidden` clips at the
      *padding* box — a sliver of a clipped third line rendered inside that
      padding, under the row's border, on anything long enough to need it.
      Letting it wrap to full height on a phone removes the clamp and the
      clip both; `sm:truncate` keeps it to one line from `sm` up, where the
      row has the width to spare instead.
    */
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 last:border-b-0 sm:flex-nowrap">
      <Link
        to={notificationUrlForSubject(
          entry.eventId,
          entry.subjectId ?? entry.typeId,
          entry.characterId
        )}
        // Deliberate §6c deviation: no › caret. The dismiss × is the row's one trailing control and the body text is the link.
        // Body text stays dim (a feed of accent sentences would drown the cues that matter); it underlines on hover.
        className={cx(
          'order-4 flex min-w-0 basis-full items-center gap-1 rounded-xs text-xs text-text-dim hover:text-text hover:underline sm:order-1 sm:flex-1 sm:basis-auto',
          interactiveClassName,
          focusRingInsetClassName
        )}
      >
        <span className="min-w-0 flex-1 sm:truncate">{body}</span>
      </Link>
      {pillName !== null && (
        <CharacterLink
          id={entry.characterId}
          className="order-1 max-w-24 shrink-0 truncate bg-panel-2 px-1 py-0.5 text-[0.6875rem] font-medium sm:order-2 sm:max-w-none"
        >
          {pillName}
        </CharacterLink>
      )}
      <time
        dateTime={firedAt.toISOString()}
        className="order-2 ml-auto shrink-0 text-[0.6875rem] tabular-nums text-text-dim sm:order-3 sm:ml-0 sm:w-16 sm:text-right"
      >
        <HintText content={formatTimestamp(firedAt, timeZone)}>
          {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
          {formatAge(Math.max(0, Date.now() - entry.firedAt), t)}
        </HintText>
      </time>
      {/* A fill dated by the poll that noticed it, until the wallet shows the sale (`fillTimeSettle.ts`). */}
      {isProvisionalFill(entry) && (
        <InfoTooltip
          label={t('alerts.fillTimeProvisional.label')}
          content={t('alerts.fillTimeProvisional.content')}
          className="order-2 sm:order-3"
        />
      )}
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
