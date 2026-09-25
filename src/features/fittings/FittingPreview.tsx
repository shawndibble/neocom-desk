import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
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
  /** Keeps edited notes on a saved fitting. */
  onSaveNotes: (notes: string) => void;
}

/** One boxed part of the preview, headed like the editor's panels. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-line">
      <h3 className="border-b border-line bg-panel-2 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
      </h3>
      <div className="p-3">{children}</div>
    </section>
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

/** A saved fitting's notes, or an In-game one's description. */
function rowNotes(row: LibraryRow): string {
  return row.source === 'saved' ? (row.record.notes ?? '') : row.inGame.description.trim();
}

/**
 * The selected Fitting on the Start screen (scope decision `20260925-152418`):
 * the Ring (hover a slot for its module) with Skills beneath it, and to its
 * right what the fit asks of the hull with the Offense, Defense and Notes boxes —
 * worked out for this one Fitting only, so a long list costs nothing until a
 * row is picked.
 */
export function FittingPreview({
  row,
  characterId,
  catalogue,
  onOpen,
  onCompare,
  onRename,
  onDelete,
  onSaveNotes,
}: FittingPreviewProps) {
  const { t } = useTranslation();
  const fitting = usePreviewFitting(row);
  const { profile } = usePilotProfile(characterId);
  const fittings = useMemo(() => [fitting], [fitting]);
  const compared = useCompareStats(fittings, profile);
  const shareCode = useShareCode(row, fitting);

  const stats = compared.values[0];
  const unreadable = row.source === 'saved' && row.hull === null;
  const notes = rowNotes(row);
  const typeName = (typeId: number) => catalogueTypeName(catalogue, typeId);
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
          <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {fitting && (
                <FittingRing
                  fitting={fitting}
                  stats={stats ?? null}
                  moduleResults={stats?.modules ?? null}
                  typeName={typeName}
                  compact
                  bare
                />
              )}
              <Section title={t('fittings.start.preview.sectionSkills')}>
                {fitting && <SkillsPanel fitting={fitting} characterId={characterId} />}
              </Section>
            </div>
            <div className="min-w-0 space-y-4">
              {stats ? (
                <FitMeters stats={stats} />
              ) : compared.failed[0] ? (
                <p className="text-xs text-warning">{t('fittings.start.preview.statsFailed')}</p>
              ) : (
                <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
              )}
              <Section title={t('fittings.start.preview.sectionOffense')}>
                {stats ? (
                  <OffensePanel stats={stats} typeName={typeName} />
                ) : (
                  <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
                )}
              </Section>
              <Section title={t('fittings.start.preview.sectionDefense')}>
                {stats ? (
                  <DefensePanel stats={stats} />
                ) : (
                  <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
                )}
              </Section>
              {/* A saved fitting always offers Notes (to write them); an In-game one only when it has a description. */}
              {(row.source === 'saved' || notes !== '') && (
                <Section title={t('fittings.start.preview.sectionNotes')}>
                  <NotesPanel
                    text={notes}
                    onSave={row.source === 'saved' ? onSaveNotes : undefined}
                  />
                </Section>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
