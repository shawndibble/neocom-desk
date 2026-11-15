import { Link } from 'react-router-dom';
import { cx } from '@/lib/cx';
import { focusRingClassName } from './controlStyles';
import { GlyphSlash } from './GlyphSlash';
import { ICON_SIZE, Share } from './icons';
import { Tooltip } from './Tooltip';

/**
 * A row's "shared with others" mark (Pop Sharing, issue #6226): the accent share glyph, its
 * tooltip naming who sees it. `off` is the same glyph dimmed and slashed: sharing was turned
 * off by someone other than the viewer (a moon owner's opt-out), so colour is never the only
 * signal. A row with nothing shared carries no mark.
 *
 * With `to` the mark is a link to where the sharing is set; without, a labelled image whose
 * tap opens the tooltip (`role="img"`, no tab stop on every row: the `ScheduledPushBadge`
 * pattern).
 */
export function ShareMark({
  label,
  off = false,
  to,
}: {
  label: string;
  off?: boolean;
  to?: string;
}) {
  const glyph = (
    <>
      <Share size={ICON_SIZE.sm} />
      {off && <GlyphSlash />}
    </>
  );
  const tone = off ? 'text-text-dim' : 'text-accent';
  if (to) {
    return (
      <Tooltip content={label}>
        <Link
          to={to}
          aria-label={label}
          className={cx(
            'relative inline-flex shrink-0 items-center justify-center rounded-xs align-middle touch:size-9',
            tone,
            focusRingClassName
          )}
        >
          <span className="relative inline-flex">{glyph}</span>
        </Link>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label} openOnTap>
      <span
        role="img"
        aria-label={label}
        className={cx('relative inline-flex shrink-0 align-middle', tone)}
      >
        {glyph}
      </span>
    </Tooltip>
  );
}
