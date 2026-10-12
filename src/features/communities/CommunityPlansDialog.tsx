import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, SearchInput, Spinner } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import type { SharedPlan } from '@/engine/communities/sharedPlans';
import { loadCommunityMembers, loadMyCommunities } from './communityStore';
import { loadCommunityPlans } from './sharedPlans';

interface Row extends SharedPlan {
  communityName: string;
  sharerName: string;
}

type State = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; rows: Row[] };

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
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const communities = await loadMyCommunities(characterId);
        const rows = (
          await Promise.all(
            communities.map(async (community) => {
              const [plans, members] = await Promise.all([
                loadCommunityPlans(characterId, community.id),
                loadCommunityMembers(characterId, community.id),
              ]);
              const names = new Map(members.map((member) => [member.uid, member.characterName]));
              return plans.map((plan): Row => ({
                ...plan,
                communityName: community.name,
                sharerName: names.get(plan.ownerUid) ?? t('communities.plansDialog.formerMember'),
              }));
            })
          )
        ).flat();
        if (!cancelled) setState({ status: 'ready', rows });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, t]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.rows
      .filter(
        (row) =>
          row.name.toLowerCase().includes(needle) || row.sharerName.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state, needle]);

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
            <>
              <SearchInput
                className="w-full"
                value={query}
                placeholder={t('communities.plansDialog.search')}
                aria-label={t('communities.plansDialog.search')}
                onChange={(event) => setQuery(event.target.value)}
              />
              {shown.length === 0 ? (
                <EmptyState title={t('communities.plansDialog.noMatch')} />
              ) : (
                <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                  {shown.map((row) => (
                    <li
                      key={`${row.communityId}:${row.id}`}
                      className="flex items-center gap-2 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{row.name}</span>
                        <span className="block truncate text-text-dim">
                          {t('communities.plansDialog.detail', {
                            name: row.sharerName,
                            community: row.communityName,
                            count: row.entries.length,
                          })}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        onClick={() => onCopy({ name: row.name, entries: row.entries })}
                      >
                        {t('communities.plansDialog.copy')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ))}
      </div>
    </Modal>
  );
}
