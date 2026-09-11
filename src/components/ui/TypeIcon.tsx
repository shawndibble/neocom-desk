import { useState } from 'react';
import { typeBlueprintIconUrl, typeIconUrl } from '@/lib/eveImages';
import { cx } from '@/lib/cx';
import { Container } from './icons';

interface TypeIconProps {
  typeId: number;
  size: 32 | 64 | 128;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * A type's icon, e.g. for the Market list or an item detail header. Always
 * decorative — every call site sits next to text that already names the
 * item, same as `CharacterAvatar`'s default (unlike a portrait, a type icon
 * is never a row's sole identifier, so there's no accessible-name case to
 * carry here).
 *
 * Blueprints and reaction formulas have no `icon` render on the EVE image
 * server (it 400s) — only a `bp` one, under the same type ID — and SKINs
 * have no render at all in any variation. Rather than let every one of
 * those show the browser's identical broken-image glyph, this falls back
 * `icon` -> `bp` -> a generic placeholder glyph.
 */
export function TypeIcon({ typeId, size, width, height, className }: TypeIconProps) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  // Resets the fallback stage when `typeId` changes without an effect — the
  // "adjust state during render" pattern React docs recommend for this
  // exact case (https://react.dev/learn/you-might-not-need-an-effect).
  const [renderedTypeId, setRenderedTypeId] = useState(typeId);
  if (typeId !== renderedTypeId) {
    setRenderedTypeId(typeId);
    setStage(0);
  }

  if (stage === 2) {
    return (
      <span
        className={cx('inline-flex shrink-0 items-center justify-center text-text-dim', className)}
        style={{ width, height }}
      >
        <Container aria-hidden="true" size="100%" />
      </span>
    );
  }

  return (
    <img
      src={stage === 0 ? typeIconUrl(typeId, size) : typeBlueprintIconUrl(typeId, size)}
      alt=""
      width={width}
      height={height}
      className={className}
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
    />
  );
}
