import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, Panel, Tooltip } from '@/components/ui';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
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
import { usePilotProfile, type PilotProfileState } from './fittingPilotProfile';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import { useCompareFittings } from './useCompareFittings';
import { useCompareStats } from './useCompareStats';
import { useShipDataNeedsConnection } from './useDogmaEngineStatus';
import { heldFitting, libraryRowCode, type LibraryRow } from './useLibraryFittings';
import { StatNote } from './StatFacts';

interface FittingPreviewProps {
  row: LibraryRow;
  characterId: number | null;
  catalogue: FittingCatalogue | null;
  onOpen: () => void;
  onCompare: (code: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onSaveNotes: (notes: string) => void;
}

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

const holdsFitting = (row: LibraryRow) => row.source === 'inGame' || row.source === 'active';

function usePreviewFitting(row: LibraryRow): Fitting | null {
  const savedCode = libraryRowCode(row);
  const codes = useMemo(() => (savedCode === null ? [] : [savedCode]), [savedCode]);
  const decoded = useCompareFittings(codes)[0]?.fitting ?? null;
  const held = useMemo(() => heldFitting(row), [row]);
  return holdsFitting(row) ? held : decoded;
}

function useShareCode(row: LibraryRow, fitting: Fitting | null): string | null | undefined {
  const encodes = holdsFitting(row);
  const encode = useCallback(
    () =>
      encodes && fitting !== null
        ? encodeFittingShare(fittingToShareInput(fitting)).then((result) =>
            result.ok ? result.payload : null
          )
        : Promise.resolve(undefined),
    [encodes, fitting]
  );
  const encoded = useAsyncLoad(encode).data;
  if (!encodes) return libraryRowCode(row);
  return encoded;
}

function sharedByText(row: Extract<LibraryRow, { source: 'shared' }>, t: TFunction): string {
  return t('fittings.share.sharedBy', {
    name: row.sharer ?? t('fittings.share.unknownSharer'),
    communities: row.communityNames.join(', '),
  });
}

function rowNotes(row: LibraryRow): string {
  if (row.source === 'saved') return row.record.notes ?? '';
  return row.source === 'inGame' ? row.inGame.description.trim() : '';
}

export function FittingPreview(props: FittingPreviewProps) {
  const pilot = usePilotProfile(props.characterId);
  return <RowPreview key={props.row.id} {...props} pilot={pilot} />;
}

function RowPreview({
  row,
  characterId,
  catalogue,
  onOpen,
  onCompare,
  onRename,
  onDelete,
  onSaveNotes,
  pilot,
}: FittingPreviewProps & { pilot: PilotProfileState }) {
  const { t } = useTranslation();
  const fitting = usePreviewFitting(row);
  const { profile, failed: profileFailed, skillsKnown, retry: retryProfile } = pilot;
  const fittings = useMemo(() => [fitting], [fitting]);
  const compared = useCompareStats(fittings, profile);
  const shareCode = useShareCode(row, fitting);

  const stats = compared.values[0];
  const needsConnection = useShipDataNeedsConnection();
  const statsGaveUp = !stats && (profileFailed || compared.failed[0]);
  const retryStats = profileFailed ? retryProfile : compared.retry;
  const noStatsText = (key: string) => (statsGaveUp ? t('fittings.stats.unavailable') : t(key));
  const unreadable = row.source === 'saved' && row.hull === null;
  const notes = rowNotes(row);
  const typeName = (typeId: number) => catalogueTypeName(catalogue, typeId);
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
                : row.source === 'active'
                  ? t('fittings.start.sourceActive')
                  : row.source === 'doctrine'
                    ? t('fittings.start.doctrineOf')
                    : sharedByText(row, t)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {row.source === 'saved' && (
              <>
                <Button variant="ghost" onClick={onRename}>
                  {t('fittings.start.preview.rename')}
                </Button>
                <Button variant="ghost" onClick={onDelete}>
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
            <Tooltip content={fitting === null ? t('fittings.start.preview.openLoading') : null}>
              <Button
                variant="primary"
                aria-disabled={fitting === null || undefined}
                onClick={onOpen}
              >
                {t('fittings.start.preview.open')}
              </Button>
            </Tooltip>
          </div>
        </div>

        {row.source === 'doctrine' && row.legacy && (
          <StatNote>{t('fittings.start.doctrineLegacy')}</StatNote>
        )}

        {unreadable ? (
          <p className="text-xs text-warning">{t('fittings.start.preview.unreadable')}</p>
        ) : (
          <div className="@container min-w-0">
            <div className="grid items-start gap-4 @2xl:grid-cols-[minmax(16rem,min(34rem,45%))_minmax(0,1fr)]">
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
