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

const typeIdsWithBpRender = new Set<number>();

function initialStage(typeId: number): 0 | 1 {
  return typeIdsWithBpRender.has(typeId) ? 1 : 0;
}

export function TypeIcon({ typeId, size, width, height, className }: TypeIconProps) {
  const [stage, setStage] = useState<0 | 1 | 2>(() => initialStage(typeId));
  const [renderedTypeId, setRenderedTypeId] = useState(typeId);
  if (typeId !== renderedTypeId) {
    setRenderedTypeId(typeId);
    setStage(initialStage(typeId));
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
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      onLoad={() => {
        if (stage === 1) typeIdsWithBpRender.add(typeId);
      }}
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
    />
  );
}
