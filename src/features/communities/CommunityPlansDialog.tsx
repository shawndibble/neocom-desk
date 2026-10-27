import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { loadCommunityMembersCached, withMyCommunities } from './communityStore';
import { loadCommunityPlans } from './sharedPlans';
import { SharedPlanList, type SharedPlanRow } from './SharedPlanList';

type State =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; rows: SharedPlanRow[] };

/**
 * Browse the Skill Plans the active Character's Communities share (Skills ›
 * Plans › New plan › From a Community plan): a search over every shared plan
 * with who shared it and where, and Copy to my plans, which hands the name and
 * skills back to the plan list to add as one of the pilot's own. Copying makes
 * an ordinary plan; it does not follow the original.
 */
export function CommunityPlansDialog({
  characterId,
  onCopy,
  onClose,
}: {
  characterId: number;
  onCopy: (plan: { name: string; entries: PlanEntry[] }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await withMyCommunities(characterId, async (communities) =>
          (
            await Promise.all(
              communities.map(async (community) => {
                const [plans, members] = await Promise.all([
                  loadCommunityPlans(characterId, community.id),
                  loadCommunityMembersCached(characterId, community.id),
                ]);
                const names = new Map(members.map((member) => [member.uid, member.characterName]));
                return plans.map((plan): SharedPlanRow => {
                  const sharerName =
                    names.get(plan.ownerUid) ?? t('communities.plansDialog.formerMember');
                  return {
                    key: `${plan.communityId}:${plan.id}`,
                    name: plan.name,
                    sharerName,
                    detail: t('communities.plansDialog.detail', {
                      name: sharerName,
                      community: community.name,
                      count: plan.entries.length,
                    }),
                    entries: plan.entries,
                  };
                });
              })
            )
          ).flat()
        );
        if (!cancelled) setState({ status: 'ready', rows });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, t]);

  return (
    <Modal open onClose={onClose} title={t('communities.plansDialog.title')}>
      <div className="min-w-0 space-y-2">
        {state.status === 'loading' && (
          <Spinner size="sm" label={t('communities.plansDialog.loading')} />
        )}
        {state.status === 'failed' && (
          <p role="alert" className="text-xs text-danger">
            {t('communities.plansDialog.failed')}
          </p>
        )}
        {state.status === 'ready' &&
          (state.rows.length === 0 ? (
            <EmptyState
              title={t('communities.plansDialog.empty')}
              hint={t('communities.plansDialog.emptyHint')}
            />
          ) : (
            <SharedPlanList
              rows={state.rows}
              onCopy={onCopy}
              listClassName="max-h-96 overflow-y-auto"
            />
          ))}
      </div>
    </Modal>
  );
}
