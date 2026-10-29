import { useCallback, useEffect, useMemo, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, RowCaret, SearchInput, Spinner } from '@/components/ui';
import {
  focusRingClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import type { SharedFitting } from '@/engine/communities/sharedFittings';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { uidForCharacter } from '@/sync/uid';
import type { CommunityMember } from './communityStore';
import { ROW_LIMIT } from './shareLists';
import { loadCommunityFittings } from './sharedFittings';
import { useReportMineCount } from './useTabSharing';

type State =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; fittings: SharedFitting[] };

/**
 * The Fittings tab's Everyone view: every Fitting the Community's Members
 * share, this Character's own included. A row opens the Fitting in the editor
 * for the pilot's own skills, where Save keeps a copy; the row is the link, so
 * it carries no other control (DESIGN.md §6c, Restraint).
 */
export function CommunitySharedFittings({
  characterId,
  communityId,
  members,
  onMineCount,
}: {
  characterId: number;
  communityId: string;
  /** For the sharer's name; null while the roster loads. */
  members: readonly CommunityMember[] | null;
  /** How many of the listed Fittings are this Character's, once loaded (the tab's sharing line). */
  onMineCount?: (count: number) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const myUid = uidForCharacter(characterId);
  useReportMineCount(state.status === 'ready' ? state.fittings : null, myUid, onMineCount);

  useEffect(() => {
    let cancelled = false;
    loadCommunityFittings(characterId, communityId).then(
      (fittings) => {
        if (!cancelled) setState({ status: 'ready', fittings });
      },
      () => {
        if (!cancelled) setState({ status: 'failed' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId]);

  const names = useMemo(
    () => new Map((members ?? []).map((member) => [member.uid, member.characterName])),
    [members]
  );
  // The label the row shows is the one the search matches ("you" for this Character's own).
  const sharerOf = useCallback(
    (uid: string) =>
      uid === myUid
        ? t('communities.you')
        : (names.get(uid) ?? t('communities.plansDialog.formerMember')),
    [myUid, names, t]
  );
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.fittings
      .filter((fitting) =>
        [fitting.name, fitting.hull, sharerOf(fitting.ownerUid)].some((text) =>
          text.toLowerCase().includes(needle)
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state, needle, sharerOf]);

  if (state.status === 'loading') {
    return <Spinner size="sm" label={t('communities.everyone.fittingsLoading')} />;
  }
  if (state.status === 'failed') {
    return <InlineError>{t('communities.everyone.fittingsFailed')}</InlineError>;
  }
  if (state.fittings.length === 0) {
    return (
      <EmptyState
        title={t('communities.everyone.noFittings')}
        hint={t('communities.everyone.noFittingsHint')}
      />
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput
        className="w-full"
        value={query}
        placeholder={t('communities.everyone.fittingsSearch')}
        aria-label={t('communities.everyone.fittingsSearch')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length === 0 ? (
        <EmptyState title={t('communities.fittings.noMatch')} />
      ) : (
        <ul className="divide-y divide-line">
          {shown.slice(0, ROW_LIMIT).map((fitting) => (
            <li key={fitting.id}>
              <Link
                to={fittingEditLocation(fitting.code)}
                className={`group flex w-full items-center gap-2 px-1 py-1.5 text-xs ${rowInteractiveClassName} ${tappableRowClassName} ${focusRingClassName} focus-visible:-outline-offset-2`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-accent">{fitting.name}</span>
                  <span className="block truncate text-text-dim">
                    {t('communities.everyone.fittingDetail', {
                      hull: fitting.hull,
                      name: sharerOf(fitting.ownerUid),
                    })}
                  </span>
                </span>
                {fitting.source === 'game' && (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('communities.fittings.inGame')}
                  </span>
                )}
                <RowCaret />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown.length > ROW_LIMIT && (
        <p className="text-xs text-text-dim">
          {t('communities.blueprints.limited', { count: ROW_LIMIT })}
        </p>
      )}
    </div>
  );
}
