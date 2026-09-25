import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Tabs, TypeIcon } from '@/components/ui';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { typeRenderUrl } from '@/lib/eveImages';
import {
  DefensePanel,
  FitMeters,
  NotesPanel,
  OffensePanel,
  SkillsPanel,
} from './FittingPreviewPanels';
import { FittingRing } from './FittingRing';
import { usePilotProfile } from './fittingPilotProfile';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import { useCompareFittings } from './useCompareFittings';
import { useCompareStats } from './useCompareStats';
import type { LibraryRow } from './useLibraryFittings';

interface FittingPreviewProps {
  row: LibraryRow;
  characterId: number | null;
  /** Names the weapons, ammo and modules the preview lists. */
  catalogue: FittingCatalogue | null;
  onOpen: () => void;
  onCompare: (code: string) => void;
  onRename: () => void;
  onDelete: () => void;
}

type PreviewTab = 'offense' | 'defense' | 'skills' | 'notes';

/** A hull's 3D render; the plain icon where the image server has none. */
function HullArt({ typeId }: { typeId: number }) {
  const [failedFor, setFailedFor] = useState<number | null>(null);
  if (failedFor === typeId) return <TypeIcon typeId={typeId} size={128} width={64} height={64} />;
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

/** What a row has to say for itself beyond its stats: an In-game Fitting's description. */
function rowNotes(row: LibraryRow): string {
  return row.source === 'inGame' ? row.inGame.description.trim() : '';
}

/**
 * The selected Fitting on the Start screen (scope decision `20260925-152418`):
 * the Ring (hover a slot for its module), what the fit asks of the hull, then
 * Offense / Defense / Skills / Notes one at a time — worked out for this one
 * Fitting only, so a long list costs nothing until a row is picked.
 */
export function FittingPreview({
  row,
  characterId,
  catalogue,
  onOpen,
  onCompare,
  onRename,
  onDelete,
}: FittingPreviewProps) {
  const { t } = useTranslation();
  const fitting = usePreviewFitting(row);
  const { profile } = usePilotProfile(characterId);
  const fittings = useMemo(() => [fitting], [fitting]);
  const compared = useCompareStats(fittings, profile);
  const shareCode = useShareCode(row, fitting);
  const [tab, setTab] = useState<PreviewTab>('offense');

  const stats = compared.values[0];
  const unreadable = row.source === 'saved' && row.hull === null;
  const notes = rowNotes(row);
  const typeName = (typeId: number) => catalogueTypeName(catalogue, typeId);
  const tabs = [
    { id: 'offense', label: t('fittings.start.preview.tabOffense') },
    { id: 'defense', label: t('fittings.start.preview.tabDefense') },
    { id: 'skills', label: t('fittings.start.preview.tabSkills') },
    ...(notes === '' ? [] : [{ id: 'notes', label: t('fittings.start.preview.tabNotes') }]),
  ];
  const shownTab = tabs.some((entry) => entry.id === tab) ? tab : 'offense';

  return (
    <Panel title={row.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-dim">
            {row.hull ?? t('fittings.myFittings.unknownHull')} ·{' '}
            {row.source === 'saved'
              ? t('fittings.start.sourceSaved')
              : t('fittings.start.sourceInGame')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
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

        {unreadable ? (
          <p className="text-xs text-warning">{t('fittings.start.preview.unreadable')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-64 max-w-full shrink-0">
                {fitting && (
                  <FittingRing
                    fitting={fitting}
                    stats={stats ?? null}
                    moduleResults={stats?.modules ?? null}
                    typeName={typeName}
                    compact
                  />
                )}
              </div>
              <div className="min-w-56 flex-1 space-y-3">
                {stats ? (
                  <FitMeters stats={stats} />
                ) : compared.failed[0] ? (
                  <p className="text-xs text-warning">{t('fittings.start.preview.statsFailed')}</p>
                ) : (
                  <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
                )}
                <div className="flex h-20 w-32 items-center justify-center border border-line bg-panel-2">
                  {fitting && <HullArt typeId={fitting.shipTypeId} />}
                </div>
              </div>
            </div>

            <Tabs
              tabs={tabs}
              value={shownTab}
              onChange={(id) => setTab(id as PreviewTab)}
              label={t('fittings.start.preview.tabsLabel')}
            />
            <div>
              {shownTab === 'skills' ? (
                fitting && <SkillsPanel fitting={fitting} characterId={characterId} />
              ) : shownTab === 'notes' ? (
                <NotesPanel text={notes} />
              ) : stats ? (
                shownTab === 'offense' ? (
                  <OffensePanel stats={stats} typeName={typeName} />
                ) : (
                  <DefensePanel stats={stats} />
                )
              ) : (
                <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
