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
import { Panel, SEVERITY_TONE, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BoardSeverity } from '@/engine/severity';
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
    // `h-full` plus the column flex is what gives cards in one grid row a
    // common bottom edge — the grid stretches this Panel, and `mt-auto` on the
    // footer takes up whatever slack the shorter card has. Two cards at
    // different heights read as one of them having failed to load.
    <Panel
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
  value: number | string;
  severity: BoardSeverity;
  /** Opens the card's page; the tile is the whole hit area. */
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
 */
export function NumberTile({ label, value, severity, to }: NumberTileProps) {
  const zero = value === 0 || value === '0';
  const body = (
    <>
      {/* The digits take the tone too, not just the glyph beside them: the
          number is what is being read, and a coloured icon next to plain text
          reads as a bullet point rather than as a severity. */}
      <span className="flex items-center gap-1.5 text-xl font-medium tabular-nums">
        {!zero && <SeverityIcon severity={severity} />}
        <span className={zero ? 'text-text' : SEVERITY_TONE[severity]}>{value}</span>
      </span>
      <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</span>
    </>
  );
  const className =
    'flex min-w-0 flex-1 flex-col gap-0.5 rounded-xs border border-line bg-panel-2 px-2.5 py-2';
  if (to === undefined) return <span className={className}>{body}</span>;
  return (
    <Link
      to={to}
      className={`${className} hover:border-line-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      {body}
    </Link>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 p-3">{children}</div>;
}

export interface TriageRowProps {
  severity: BoardSeverity;
  /** The left column: a countdown, "Ready", "Idle 6h" — whatever this row's clock says. */
  when: string;
  subject: string;
  detail?: string;
  to?: string;
}

/**
 * A row for the two cards whose items really are individual: industry jobs
 * (different items, different facilities, different clocks) and planetary
 * batches (each one a separate trip).
 */
export function TriageRow({ severity, when, subject, detail, to }: TriageRowProps) {
  const { t } = useTranslation();
  const inner = (
    <>
      <span
        className={`flex w-20 shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums ${SEVERITY_TONE[severity]}`}
      >
        <SeverityIcon severity={severity} />
        {when}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">{subject}</span>
        {detail && <span className="block truncate text-[0.6875rem] text-text-dim">{detail}</span>}
      </span>
    </>
  );
  return (
    <li className="border-b border-line last:border-b-0">
      {to === undefined ? (
        <span className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 md:min-h-9">{inner}</span>
      ) : (
        <Link
          to={to}
          aria-label={t('overview.board.rowLabel', { subject, when })}
          className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-9"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
