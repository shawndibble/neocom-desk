import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useReportMineCount } from './useTabSharing';

type State =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; plans: SharedPlan[] };

/**
 * The Skill plans tab's Everyone view: every plan the Community's Members
 * share, with Copy to my plans. A copy is an ordinary plan of the pilot's own
 * (it does not follow the original), and Copy opens it, as Skills › Plans'
 * "From a Community plan" does.
 */
export function CommunitySharedPlans({
  characterId,
  communityId,
  members,
  onMineCount,
}: {
  characterId: number;
  communityId: string;
  /** For the sharer's name; null while the roster loads. */
  members: readonly CommunityMember[] | null;
  /** How many of the listed plans are this Character's, once loaded (the tab's sharing line). */
  onMineCount?: (count: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const copying = useRef(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const myUid = uidForCharacter(characterId);
  useReportMineCount(state.status === 'ready' ? state.plans : null, myUid, onMineCount);

  useEffect(() => {
    let cancelled = false;
    loadCommunityPlans(characterId, communityId).then(
      (plans) => {
        if (!cancelled) setState({ status: 'ready', plans });
      },
      () => {
        if (!cancelled) setState({ status: 'failed' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId]);

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
    // A second click while the first is still adding must not make a second plan.
    if (copying.current) return;
    copying.current = true;
    setCopyFailed(false);
    try {
      const plan = { ...newPlan(characterId, shared.name), entries: shared.entries };
      await db.skillPlans.add(plan);
      if (isSyncConfigured()) scheduleSync(characterId, { collections: ['plans'] });
      // Opening the new plan is the confirmation.
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
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.plansDialog.failed')}
      </p>
    );
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
      {copyFailed && (
        <p role="alert" className="text-xs text-danger">
          {t('communities.everyone.copyFailed')}
        </p>
      )}
    </div>
  );
}
