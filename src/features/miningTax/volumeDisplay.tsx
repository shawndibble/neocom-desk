/**
 * Shared "how much m³ did this represent" rendering for the Mining Yield
 * Overview tab and its detail modal (issue #1283): a line/row/total's known
 * volume is never withheld just because one ore type has no entry in
 * `typeVolumes` — the partial sum renders with a warning glyph naming what's
 * missing, and only a row with NOTHING known falls back to an em dash.
 */
import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatVolume } from '@/features/market/format';
import { volumeDisplayMode, type VolumeSum } from './volume';

/**
 * Volume cell/stat content: the partial sum plus a tooltipped warning glyph
 * naming the types with no known volume, never a bare em dash unless nothing
 * at all is known.
 */
export function VolumeDisplay({
  volume,
  typeNames,
  t,
  /** Appended after the number when a real figure renders, e.g. ' m³' for a standalone stat. */
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
