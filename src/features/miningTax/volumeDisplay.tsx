import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatVolume } from '@/features/market/format';
import { volumeDisplayMode, type VolumeSum } from './volume';

export function VolumeDisplay({
  volume,
  typeNames,
  t,
  suffix = '',
}: {
  volume: VolumeSum;
  typeNames: ReadonlyMap<number, string>;
  t: (key: string, options?: Record<string, unknown>) => string;
  suffix?: string;
}): ReactNode {
  const { m3, missingTypeIds } = volume;
  const mode = volumeDisplayMode(volume);
  if (mode.kind === 'complete') return `${formatVolume(m3)}${suffix}`;
  if (mode.kind === 'unknown') return '—';
  const names = missingTypeIds.map((id) => typeNames.get(id) ?? `#${id}`).join(', ');
  return (
    <span className="inline-flex items-center gap-1">
      ≈ {formatVolume(m3)}
      {suffix}
      <Tooltip content={t('miningTax.overview.volumeMissingTooltip', { types: names })} openOnTap>
        <Icon.Warn
          role="img"
          aria-label={t('miningTax.overview.volumeMissingLabel')}
          size={Icon.ICON_SIZE.sm}
          className="text-warning"
        />
      </Tooltip>
    </span>
  );
}
