import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadCharacterClones } from '@/features/character/clones';
import { loadCharacterSkills } from '@/features/skills/data';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CachedResult } from '@/esi/cache';
import type { CharacterClones, JumpClone } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { cloneJumpCooldown, INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/cloneJump';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  clonesResult: CachedResult<CharacterClones> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  clonesNeedsReauth: boolean;
  /** Trained level of Infomorph Synchronizing; 0 when unknown/untrained. */
  infomorphLevel: number;
  implantNames: Map<number, string>;
  locationNames: Map<number, string>;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

async function loadClonesSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [{ cached: clonesResult, needsReauth: clonesNeedsReauth }, skillsResult] =
    await Promise.all([loadCharacterClones(characterId), loadCharacterSkills(characterId)]);
  const loadedAt = Date.now();
  const infomorphLevel =
    skillsResult?.data.skills.find((skill) => skill.skill_id === INFOMORPH_SYNCHRONIZING_SKILL_ID)
      ?.trained_skill_level ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];

  // Already superseded: skip the name resolves, their results would be discarded.
  const implantTypeIds = signal.cancelled ? [] : [...new Set(clones.flatMap((c) => c.implants))];
  const implantNames = await loadTypeNames(implantTypeIds);

  const stationIds = signal.cancelled
    ? []
    : [...new Set(clones.filter((c) => c.location_type === 'station').map((c) => c.location_id))];
  const structureIds = signal.cancelled
    ? []
    : [...new Set(clones.filter((c) => c.location_type === 'structure').map((c) => c.location_id))];
  const [resolvedStations, resolvedStructures] = await Promise.all([
    Promise.all(stationIds.map((id) => loadStationName(id))),
    // A 403 here means the structure is outside this character's ACL, not a
    // revoked scope — loadStructureName already narrows that so it never
    // signals a re-auth failure; the clone just renders with an id fallback.
    Promise.all(structureIds.map((id) => loadStructureName(characterId, id))),
  ]);
  const locationNames = new Map<number, string>();
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });
  structureIds.forEach((id, i) => {
    const name = resolvedStructures[i];
    if (name) locationNames.set(id, name);
  });

  return { clonesResult, clonesNeedsReauth, infomorphLevel, implantNames, locationNames, loadedAt };
}

/** Clones: jump clones, their locations and implants, plus the current jump cooldown. */
export function Clones() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadClonesSnapshot);

  const clonesResult = data?.clonesResult ?? null;
  const clonesNeedsReauth = data?.clonesNeedsReauth ?? false;
  const infomorphLevel = data?.infomorphLevel ?? 0;
  const implantNames = data?.implantNames ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;
  const loadedAt = data?.loadedAt ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];
  const lastCloneJumpDate = clonesResult?.data.last_clone_jump_date ?? null;

  const cooldown = useMemo(
    () => cloneJumpCooldown(lastCloneJumpDate, infomorphLevel, new Date(loadedAt)),
    [lastCloneJumpDate, infomorphLevel, loadedAt]
  );

  const columns = useMemo<DataTableColumn<JumpClone>[]>(
    () => [
      {
        id: 'location',
        header: t('clones.location'),
        render: (clone) =>
          locationNames.get(clone.location_id) ??
          t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
            id: clone.location_id,
          }),
      },
      {
        id: 'implants',
        header: t('clones.implants'),
        render: (clone) =>
          clone.implants.length === 0
            ? t('clones.noImplants')
            : clone.implants.map((id) => implantNames.get(id) ?? `Type #${id}`).join(', '),
      },
    ],
    [t, locationNames, implantNames]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('clones.title')}
        meta={clonesResult && <DataAgeBadge date={clonesResult.fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('clones.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : clonesNeedsReauth ? (
        <ReauthBanner
          title={t('clones.reauthTitle')}
          hint={t('clones.reauthHint')}
          actionLabel={t('clones.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !clonesResult || clones.length === 0 ? (
        <EmptyState title={t('clones.emptyTitle')} hint={t('clones.emptyHint')} />
      ) : (
        <>
          <Panel>
            <p className="text-sm">
              {cooldown.onCooldown && cooldown.readyAt
                ? t('clones.cooldownOnCooldown', {
                    date: cooldown.readyAt.toLocaleString(),
                    duration: formatDuration((cooldown.readyAt.getTime() - loadedAt) / 1000),
                  })
                : t('clones.cooldownReady')}
            </p>
          </Panel>
          <Panel padded={false}>
            {clonesResult.fromCache && (
              <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                {t('common.offlineTitle')}
              </p>
            )}
            <DataTable
              label={t('clones.title')}
              columns={columns}
              rows={clones}
              rowKey={(clone) => clone.jump_clone_id}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
