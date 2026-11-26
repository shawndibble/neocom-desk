import { useCallback, useMemo } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { loadCommunityMembersCached, withMyCommunities } from './communityStore';
import { loadCommunityPlans } from './sharedPlans';
import { SharedPlanList, type SharedPlanRow } from './SharedPlanList';

type State =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; rows: SharedPlanRow[] };

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
  const load = useCallback(
    () =>
      withMyCommunities(characterId, async (communities) =>
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
      ),
    [characterId, t]
  );
  const loaded = useKeyedLoad(String(characterId), load);
  const state = useMemo<State>(
    () =>
      loaded.status === 'ready'
        ? { status: 'ready', rows: loaded.data }
        : { status: loaded.status === 'failed' ? 'failed' : 'loading' },
    [loaded.status, loaded.data]
  );

  return (
    <Modal open onClose={onClose} title={t('communities.plansDialog.title')}>
      <div className="min-w-0 space-y-2">
        {state.status === 'loading' && (
          <Spinner size="sm" label={t('communities.plansDialog.loading')} />
        )}
        {state.status === 'failed' && (
          <InlineError>{t('communities.plansDialog.failed')}</InlineError>
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
