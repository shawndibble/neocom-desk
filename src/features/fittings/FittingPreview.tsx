import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, TypeIcon } from '@/components/ui';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { typeRenderUrl } from '@/lib/eveImages';
import { formatCompactNumber } from '@/lib/compactNumber';
import { usePilotProfile } from './fittingPilotProfile';
import { useCompareCanFly } from './useCompareCanFly';
import { useCompareFittings } from './useCompareFittings';
import { useCompareStats } from './useCompareStats';
import type { LibraryRow } from './useLibraryFittings';

interface FittingPreviewProps {
  row: LibraryRow;
  characterId: number | null;
  onOpen: () => void;
  onCompare: (code: string) => void;
  onRename: () => void;
  onDelete: () => void;
}

/** A hull's 3D render; the plain icon where the image server has none. */
function HullArt({ typeId }: { typeId: number }) {
  const [failedFor, setFailedFor] = useState<number | null>(null);
  if (failedFor === typeId) return <TypeIcon typeId={typeId} size={128} width={96} height={96} />;
  return (
    <img
      src={typeRenderUrl(typeId, 256)}
      alt=""
      width={256}
      height={256}
      className="h-full w-full object-contain"
      onError={() => setFailedFor(typeId)}
    />
  );
}

/** A saved Fitting decodes from its code; an In-game one maps straight from ESI's own shape. */
function usePreviewFitting(row: LibraryRow): Fitting | null {
  const savedCode = row.source === 'saved' ? row.record.code : null;
  const codes = useMemo(() => (savedCode === null ? [] : [savedCode]), [savedCode]);
  const decoded = useCompareFittings(codes)[0]?.fitting ?? null;
  const inGame = useMemo(
    () => (row.source === 'inGame' ? esiFittingToFitting(row.inGame).fitting : null),
    [row]
  );
  return row.source === 'saved' ? decoded : inGame;
}

/** The Share Link code compare needs: a saved Fitting has one, an In-game one is encoded once; null when too large. */
function useShareCode(row: LibraryRow, fitting: Fitting | null): string | null | undefined {
  const [encoded, setEncoded] = useState<{ fitting: Fitting; code: string | null } | null>(null);
  useEffect(() => {
    if (row.source === 'saved' || fitting === null) return;
    let cancelled = false;
    void encodeFittingShare(fittingToShareInput(fitting)).then((result) => {
      if (!cancelled) setEncoded({ fitting, code: result.ok ? result.payload : null });
    });
    return () => {
      cancelled = true;
    };
  }, [row.source, fitting]);
  if (row.source === 'saved') return row.record.code;
  return encoded?.fitting === fitting ? encoded.code : undefined;
}

/**
 * The selected Fitting on the Start screen: the hull, the headline numbers and
 * whether the Character can fly it — worked out for this one Fitting only, so
 * a long list costs nothing until a row is picked.
 */
export function FittingPreview({
  row,
  characterId,
  onOpen,
  onCompare,
  onRename,
  onDelete,
}: FittingPreviewProps) {
  const { t } = useTranslation();
  const fitting = usePreviewFitting(row);
  const { profile } = usePilotProfile(characterId);
  const fittings = useMemo(() => [fitting], [fitting]);
  const stats = useCompareStats(fittings, profile);
  const canFly = useCompareCanFly(fittings, profile);
  const shareCode = useShareCode(row, fitting);

  const s = stats.values[0];
  const numbers: { label: string; value: string }[] = s
    ? [
        { label: t('fittings.start.preview.dps'), value: formatCompactNumber(s.offense.dps) },
        { label: t('fittings.start.preview.ehp'), value: formatCompactNumber(s.ehp) },
        {
          label: t('fittings.start.preview.cpu'),
          value: `${formatCompactNumber(s.cpuUsed)} / ${formatCompactNumber(s.cpuTotal)}`,
        },
        {
          label: t('fittings.start.preview.powergrid'),
          value: `${formatCompactNumber(s.powergridUsed)} / ${formatCompactNumber(s.powergridTotal)}`,
        },
      ]
    : [];

  return (
    <Panel title={row.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-40 w-56 max-w-full items-center justify-center border border-line bg-panel-2">
            {fitting && <HullArt typeId={fitting.shipTypeId} />}
          </div>
          <div className="min-w-56 flex-1 space-y-3">
            <p className="text-sm text-text-dim">
              {row.hull} ·{' '}
              {row.source === 'saved'
                ? t('fittings.start.sourceSaved')
                : t('fittings.start.sourceInGame')}
            </p>
            {stats.failed[0] ? (
              <p className="text-xs text-warning">{t('fittings.start.preview.statsFailed')}</p>
            ) : s ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
                {numbers.map((n) => (
                  <div key={n.label} className="contents">
                    <dt className="text-text-dim">{n.label}</dt>
                    <dd className="text-right">{n.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
            )}
            {canFly.values[0] !== null && (
              <p
                className={`text-xs ${canFly.values[0] ? 'text-success' : 'text-warning'}`}
                data-testid="preview-can-fly"
              >
                {canFly.values[0]
                  ? t('fittings.start.preview.canFly')
                  : t('fittings.start.preview.missingSkills')}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {row.source === 'saved' && (
            <>
              <Button size="sm" variant="ghost" onClick={onRename}>
                {t('fittings.start.preview.rename')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete}>
                {t('fittings.start.preview.delete')}
              </Button>
            </>
          )}
          <Button
            disabled={typeof shareCode !== 'string'}
            title={shareCode === null ? t('fittings.start.preview.tooLargeToCompare') : undefined}
            onClick={() => typeof shareCode === 'string' && onCompare(shareCode)}
          >
            {t('fittings.start.preview.compare')}
          </Button>
          <Button variant="primary" disabled={fitting === null} onClick={onOpen}>
            {t('fittings.start.preview.open')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
