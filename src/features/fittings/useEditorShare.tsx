/**
 * "Share to Community" in the open Fitting's Export menu (issue #3605): only for
 * a Fitting that is saved, since a Community holds the saved copy and follows
 * its later saves. Absent with no Community, direct with one, a submenu with
 * several — as on a library row. The Communities and which already hold this
 * Fitting are read once per open Fitting, not each time the menu opens.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui';
import { NOTICE_MS, useTimedToast } from '@/components/ui/useTimedToast';
import { shareMenuMode } from '@/engine/communities/sharedFittings';
import type { CommunitySummary } from '@/features/communities/communityStore';
import { useOnline } from '@/stores/network';

export interface EditorShare {
  items: ReactNode;
  notice: string | null;
}

interface Status {
  recordId: string;
  communities: CommunitySummary[];
  sharedIn: ReadonlySet<string>;
}

export function useEditorShare(
  characterId: number | null,
  record: { id: string; name: string; code: string } | null
): EditorShare {
  const { t } = useTranslation();
  const online = useOnline();
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useTimedToast(notice, () => setNotice(null), NOTICE_MS);
  const recordId = record?.id ?? null;

  const load = useCallback(async () => {
    if (characterId === null || recordId === null || !isSyncConfigured()) return;
    try {
      const { loadShareStatus } = await import('@/features/communities/sharedFittings');
      const loaded = await loadShareStatus(characterId, { source: 'saved', key: recordId });
      setStatus({ recordId, ...loaded });
    } catch {
      // Offline or signed out of sync: no Share item, nothing else changes.
    }
  }, [characterId, recordId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a different open Fitting re-reads its shares, not a render-time derivation
    void load();
  }, [load]);

  if (characterId === null || record === null || status === null || status.recordId !== record.id) {
    return { items: null, notice };
  }
  const mode = shareMenuMode(status.communities.length);
  if (mode === 'none') return { items: null, notice };

  async function toggle(community: CommunitySummary) {
    if (characterId === null || record === null || status === null) return;
    const shared = await import('@/features/communities/sharedFittings');
    const outcome = await shared.toggleShare(
      characterId,
      community.id,
      { source: 'saved', key: record.id },
      { name: record.name, code: record.code },
      status.sharedIn.has(community.id)
    );
    setNotice(t(`fittings.share.${outcome}`, { community: community.name }));
    if (outcome === 'shared' || outcome === 'unshared') await load();
  }
  const label = (community: CommunitySummary) =>
    status.sharedIn.has(community.id)
      ? t('fittings.share.unshareFrom', { community: community.name })
      : t('fittings.share.shareTo', { community: community.name });

  // Sharing writes to the Community; offline it can only fail, so say why it is off (the reason sits
  // under the item, as on Save to EVE, because a disabled menu item takes no hover for a tooltip).
  const offlineReason = online ? null : (
    <p className="max-w-64 px-3 pb-2 text-xs text-text-dim">
      {t('fittings.share.needsConnection')}
    </p>
  );

  if (mode === 'direct') {
    const [only] = status.communities;
    return {
      items: (
        <>
          <DropdownMenuItem disabled={!online} onSelect={() => void toggle(only)}>
            {label(only)}
          </DropdownMenuItem>
          {offlineReason}
        </>
      ),
      notice,
    };
  }
  return {
    items: (
      <>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!online}>
            {t('fittings.share.shareToCommunity')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {status.communities.map((community) => (
              <DropdownMenuItem key={community.id} onSelect={() => void toggle(community)}>
                {label(community)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {offlineReason}
      </>
    ),
    notice,
  };
}
