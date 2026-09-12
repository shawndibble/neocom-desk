/**
 * The Overview board's shared card shapes.
 *
 * One rule runs through all of them, and it is the whole reason the board was
 * reworked: **numbers where the items are interchangeable, rows only where
 * each item is genuinely its own thing.** Twenty-one undercut orders is one
 * fact, not twenty-one; four colonies on the same timer is one trip, not four.
 * A card that prints a row per item is unusable on exactly the days it
 * matters, which is why `NumberTile` exists at all.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Panel, SEVERITY_TEXT, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { DeadlineSeverity } from '@/engine/severity';
import type { AppRoutePath } from '@/app/routeScopes';

export interface BoardCardProps {
  title: string;
  /** A word or count beside the title — what the card says without being read. */
  meta?: ReactNode;
  /** Where the card's own page is. Rendered as the header's one action. */
  to: AppRoutePath | string;
  openLabel: string;
  children: ReactNode;
  /** Pinned to the card's bottom edge, so cards in a row line up however tall each one's body is. */
  footer?: ReactNode;
}

export function BoardCard({ title, meta, to, openLabel, children, footer }: BoardCardProps) {
  return (
    /*
      Three things, and all three are load-bearing for one effect: cards in a
      row sharing a bottom edge, with each one's footer on that edge.

      `h-full` + `flex flex-col` stretch the section itself. `fill` is what
      makes Panel's *content wrapper* a growing flex column rather than a plain
      block — without it the wrapper keeps its natural height inside the
      stretched section and `mt-auto` below has nothing to push against, which
      leaves dead space under the footer of every card shorter than its
      neighbour. And two cards at different heights read as one of them having
      failed to load.
    */
    <Panel
      fill
      className="flex h-full flex-col"
      title={title}
      meta={meta}
      actions={
        <Link
          to={to}
          className="flex items-center gap-1 rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {openLabel}
          <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </Link>
      }
      padded={false}
    >
      <div className="flex flex-1 flex-col">
        <div className="flex-1">{children}</div>
        {footer && (
          <p className="mt-auto border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
            {footer}
          </p>
        )}
      </div>
    </Panel>
  );
}

export interface NumberTileProps {
  label: string;
  /**
   * A count, a pre-formatted string, or a node — an ISK figure arrives as
   * `IskAmount`, which is shorthand with the exact value one gesture away.
   * `zero`/`linked` below still only recognise the primitive forms, which is
   * what keeps a node out of the link-and-tone logic it has no count for.
   */
  value: ReactNode;
  severity: DeadlineSeverity;
  /**
   * The page this count opens, already narrowed to what it counted. Optional:
   * a tile whose figure has no filtered destination — mining tax's two — is
   * plain text, and inventing a link to an unnarrowed page for it would send
   * the reader somewhere that cannot show them the number they tapped.
   */
  to?: string;
}

/**
 * One count, toned by what it means.
 *
 * **A zero drops both the tone and the glyph.** An amber "0 undercut" sends
 * you to look at a page with nothing on it, which is the exact opposite of
 * what a triage board is for — yellow says "look here", and a zero has nothing
 * to look at. The severity only applies once there is something behind the
 * number.
 *
 * **And a zero is never a link**, for the same reason and by the same test: a
 * link is the strongest "look here" a tile has, and behind this one is a page
 * filtered down to nothing. `—` is not a zero, though — it means the read
 * failed — and it is not a link either, because the count it would carry is
 * exactly what nobody knows.
 */
export function NumberTile({ label, value, severity, to }: NumberTileProps) {
  const zero = value === 0 || value === '0';
  const linked = to !== undefined && !zero && typeof value === 'number';
  const body = (
    <>
      {/* The digits take the tone too, not just the glyph beside them: the
          number is what is being read, and a coloured icon next to plain text
          reads as a bullet point rather than as a severity. */}
      <span className="flex items-center gap-1.5 text-xl font-medium tabular-nums">
        {!zero && <SeverityIcon severity={severity} />}
        <span className={zero ? 'text-text' : SEVERITY_TEXT[severity]}>{value}</span>
      </span>
      <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</span>
    </>
  );
  const className =
    'flex min-w-0 flex-1 flex-col gap-0.5 rounded-xs border border-line bg-panel-2 px-2.5 py-2';
  if (!linked) return <span className={className}>{body}</span>;
  return (
    <Link
      to={to}
      className={`${className} hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      {body}
    </Link>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 p-3">{children}</div>;
}

export interface TriageRowProps {
  severity: DeadlineSeverity;
  /** The left column: a countdown, "Ready", "Idle 6h" — whatever this row's clock says. */
  when: string;
  subject: string;
  detail?: string;
  /** Where the row leads. Every row on this board goes somewhere; there is no read-only variant. */
  to: string;
}

/**
 * A row for the two cards whose items really are individual: industry jobs
 * (different items, different facilities, different clocks) and planetary
 * batches (each one a separate trip).
 */
export function TriageRow({ severity, when, subject, detail, to }: TriageRowProps) {
  const { t } = useTranslation();
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to={to}
        aria-label={t('overview.board.rowLabel', { subject, when })}
        className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-9"
      >
        <span
          className={`flex w-20 shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums ${SEVERITY_TEXT[severity]}`}
        >
          <SeverityIcon severity={severity} />
          {when}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{subject}</span>
          {detail && (
            <span className="block truncate text-[0.6875rem] text-text-dim">{detail}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

export interface FoldedRowProps {
  /** The domain's own name — the same words its card's header carries. */
  domain: string;
  /** One line from `boardSummary.ts`: the worst true thing this domain has to say. */
  summary: string;
  /** Null while the domain's read is still in flight — no glyph rather than a guessed one. */
  severity: DeadlineSeverity | null;
  to: string;
}

/**
 * One domain, folded to a single line, for the phone's "Everything else".
 *
 * A sibling of `TriageRow` rather than a mode of it: that row's left column is
 * a fixed-width clock, and every row on this card is a whole domain rather
 * than one dated thing inside one. The two would only share a shape by making
 * the clock optional, which is how a row component ends up rendering four
 * layouts.
 *
 * The name truncates before the summary does. On the day the summary is the
 * long one it is also the one worth reading — "Planetary industr…" beside "2
 * colonies have stopped" still tells you where to tap, and the reverse does
 * not.
 */
export function FoldedRow({ domain, summary, severity, to }: FoldedRowProps) {
  const { t } = useTranslation();
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to={to}
        aria-label={t('overview.board.foldedRowLabel', { domain, summary })}
        className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {/* A fixed slot, so a domain still loading lines its name up with the
            ones that have answered instead of sliding left. */}
        <span className="flex w-4 shrink-0 justify-center">
          {severity && <SeverityIcon severity={severity} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{domain}</span>
        <span className="shrink-0 text-[0.6875rem] whitespace-nowrap text-text-dim">{summary}</span>
        <Icon.Descend
          size={Icon.ICON_SIZE.sm}
          className="shrink-0 text-accent"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
