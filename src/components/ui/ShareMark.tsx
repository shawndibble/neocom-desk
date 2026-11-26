import { Link } from 'react-router-dom';
import { cx } from '@/lib/cx';
import { focusRingClassName } from './controlStyles';
import { GlyphSlash } from './GlyphSlash';
import { ICON_SIZE, Share } from './icons';
import { Tooltip } from './Tooltip';

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
