import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, Panel, Tooltip } from '@/components/ui';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
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
import { useShipDataNeedsConnection } from './useDogmaEngineStatus';
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
      <h3 className={cx(eyebrowClassName, 'border-b border-line bg-panel-2 px-3 py-1.5')}>
        {title}
      </h3>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** The Fitting Share Code a saved or shared row carries; an In-game row has none. */
function rowCode(row: LibraryRow): string | null {
  if (row.source === 'saved') return row.record.code;
  return row.source === 'shared' ? row.shared.code : null;
}

/** A saved or shared Fitting decodes from its code; an In-game one maps straight from ESI's own shape. */
function usePreviewFitting(row: LibraryRow): Fitting | null {
  const savedCode = rowCode(row);
  const codes = useMemo(() => (savedCode === null ? [] : [savedCode]), [savedCode]);
  const decoded = useCompareFittings(codes)[0]?.fitting ?? null;
  const inGame = useMemo(
    () => (row.source === 'inGame' ? esiFittingToFitting(row.inGame).fitting : null),
    [row]
  );
  return row.source === 'inGame' ? inGame : decoded;
}

/** The Fitting Share Code compare needs: a saved Fitting has one, an In-game one is encoded once; null when too large. */
function useShareCode(row: LibraryRow, fitting: Fitting | null): string | null | undefined {
  const [encoded, setEncoded] = useState<{ fitting: Fitting; code: string | null } | null>(null);
  useEffect(() => {
    if (row.source !== 'inGame' || fitting === null) return;
    let cancelled = false;
    void encodeFittingShare(fittingToShareInput(fitting)).then((result) => {
      if (!cancelled) setEncoded({ fitting, code: result.ok ? result.payload : null });
    });
    return () => {
      cancelled = true;
    };
  }, [row.source, fitting]);
  if (row.source !== 'inGame') return rowCode(row);
  return encoded?.fitting === fitting ? encoded.code : undefined;
}

/** "Shared by <name> in <Community>", for a Community's Fitting. */
function sharedByText(row: Extract<LibraryRow, { source: 'shared' }>, t: TFunction): string {
  return t('fittings.share.sharedBy', {
    name: row.sharer ?? t('fittings.share.unknownSharer'),
    communities: row.communityNames.join(', '),
  });
}

/** A saved fitting's notes, or an In-game one's description. */
function rowNotes(row: LibraryRow): string {
  if (row.source === 'saved') return row.record.notes ?? '';
  // Notes are never shared.
  return row.source === 'inGame' ? row.inGame.description.trim() : '';
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
  const {
    profile,
    failed: profileFailed,
    skillsKnown,
    retry: retryProfile,
  } = usePilotProfile(characterId);
  const fittings = useMemo(() => [fitting], [fitting]);
  const compared = useCompareStats(fittings, profile);
  const shareCode = useShareCode(row, fitting);

  const stats = compared.values[0];
  const needsConnection = useShipDataNeedsConnection();
  // No numbers will come: the pilot's skills could not be read, or the calculation failed.
  const statsGaveUp = !stats && (profileFailed || compared.failed[0]);
  const retryStats = profileFailed ? retryProfile : compared.retry;
  const noStatsText = (key: string) => (statsGaveUp ? t('fittings.stats.unavailable') : t(key));
  const unreadable = row.source === 'saved' && row.hull === null;
  const notes = rowNotes(row);
  const typeName = (typeId: number) => catalogueTypeName(catalogue, typeId);
  // `aria-disabled`, not the native attribute, so the reason stays reachable.
  const compareButton = (
    <Button
      aria-disabled={typeof shareCode !== 'string' || undefined}
      onClick={() => typeof shareCode === 'string' && onCompare(shareCode)}
    >
      {t('fittings.start.preview.compare')}
    </Button>
  );
  return (
    <Panel title={row.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-dim">
            {row.hull ?? t('fittings.myFittings.unknownHull')} ·{' '}
            {row.source === 'saved'
              ? t('fittings.start.sourceSaved')
              : row.source === 'inGame'
                ? t('fittings.start.sourceInGame')
                : sharedByText(row, t)}
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
            {shareCode === null ? (
              <Tooltip content={t('fittings.start.preview.tooLargeToCompare')}>
                {compareButton}
              </Tooltip>
            ) : (
              compareButton
            )}
            <Button variant="primary" disabled={fitting === null} onClick={onOpen}>
              {t('fittings.start.preview.open')}
            </Button>
          </div>
        </div>

        {unreadable ? (
          <p className="text-xs text-warning">{t('fittings.start.preview.unreadable')}</p>
        ) : (
          // Container query: the pane sits beside the list, far narrower than the viewport.
          <div className="@container min-w-0">
            <div className="grid items-start gap-4 @2xl:grid-cols-[16rem_minmax(0,1fr)]">
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
                ) : statsGaveUp ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center gap-2 text-xs text-warning"
                  >
                    <span>
                      {t(
                        profileFailed
                          ? 'fittings.stats.errorSkills'
                          : needsConnection
                            ? 'fittings.stats.errorOffline'
                            : 'fittings.start.preview.statsFailed'
                      )}
                    </span>
                    <Button size="sm" onClick={retryStats}>
                      {t('common.retry')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>
                )}
                {stats && !skillsKnown && (
                  <p className="text-xs text-warning">{t('fittings.stats.skillsUnknown')}</p>
                )}
                <Section title={t('fittings.start.preview.sectionOffense')}>
                  {stats ? (
                    <OffensePanel stats={stats} typeName={typeName} />
                  ) : (
                    <p className="text-xs text-text-dim">
                      {noStatsText('fittings.start.preview.calculating')}
                    </p>
                  )}
                </Section>
                <Section title={t('fittings.start.preview.sectionDefense')}>
                  {stats ? (
                    <DefensePanel stats={stats} />
                  ) : (
                    <p className="text-xs text-text-dim">
                      {noStatsText('fittings.start.preview.calculating')}
                    </p>
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
          </div>
        )}
      </div>
    </Panel>
  );
}
