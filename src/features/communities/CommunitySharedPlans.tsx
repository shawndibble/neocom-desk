import { useCallback, useMemo, useRef, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { isSyncConfigured } from '@/app/syncStatus';
import { db } from '@/db';
import type { SharedPlan } from '@/engine/communities/sharedPlans';
import type { PlanEntry } from '@/engine/types';
import { newPlan } from '@/features/skills/planner/newPlan';
import { scheduleSync } from '@/sync';
import { uidForCharacter } from '@/sync/uid';
import type { CommunityMember } from './communityStore';
import { loadCommunityPlans } from './sharedPlans';
import { SharedPlanList, type SharedPlanRow } from './SharedPlanList';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useReportMineCount } from './useTabSharing';

type State =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; plans: SharedPlan[] };

export function CommunitySharedPlans({
  characterId,
  communityId,
  members,
  onMineCount,
}: {
  characterId: number;
  communityId: string;
  members: readonly CommunityMember[] | null;
  onMineCount?: (count: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const load = useCallback(
    () => loadCommunityPlans(characterId, communityId),
    [characterId, communityId]
  );
  const loaded = useKeyedLoad(`${characterId}:${communityId}`, load);
  const state = useMemo<State>(
    () =>
      loaded.status === 'ready'
        ? { status: 'ready', plans: loaded.data }
        : { status: loaded.status === 'failed' ? 'failed' : 'loading' },
    [loaded.status, loaded.data]
  );
  const copying = useRef(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const myUid = uidForCharacter(characterId);
  useReportMineCount(state.status === 'ready' ? state.plans : null, myUid, onMineCount);

  const rows = useMemo<SharedPlanRow[]>(() => {
    if (state.status !== 'ready') return [];
    const names = new Map((members ?? []).map((member) => [member.uid, member.characterName]));
    return state.plans.map((plan) => {
      const sharerName =
        plan.ownerUid === myUid
          ? t('communities.you')
          : (names.get(plan.ownerUid) ?? t('communities.plansDialog.formerMember'));
      return {
        key: plan.id,
        name: plan.name,
        sharerName,
        detail: t('communities.everyone.planDetail', {
          name: sharerName,
          count: plan.entries.length,
        }),
        entries: plan.entries,
      };
    });
  }, [state, members, myUid, t]);

  async function copy(shared: { name: string; entries: PlanEntry[] }) {
    if (copying.current) return;
    copying.current = true;
    setCopyFailed(false);
    try {
      const plan = { ...newPlan(characterId, shared.name), entries: shared.entries };
      await db.skillPlans.add(plan);
      if (isSyncConfigured()) scheduleSync(characterId, { collections: ['plans'] });
      navigate(`/skills/plans/${plan.id}`);
    } catch {
      setCopyFailed(true);
    } finally {
      copying.current = false;
    }
  }

  if (state.status === 'loading') {
    return <Spinner size="sm" label={t('communities.plansDialog.loading')} />;
  }
  if (state.status === 'failed') {
    return <InlineError>{t('communities.plansDialog.failed')}</InlineError>;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('communities.plansDialog.empty')}
        hint={t('communities.everyone.noPlansHint')}
      />
    );
  }
  return (
    <div className="space-y-2">
      <SharedPlanList rows={rows} onCopy={(plan) => void copy(plan)} />
      {copyFailed && <InlineError>{t('communities.everyone.copyFailed')}</InlineError>}
    </div>
  );
}
