import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import { usePartyNames } from '@/features/character/usePartyNames';
import {
  listCommunityPopSharers,
  setCommunityPopSharingBlock,
  type CommunityPopSharer,
} from './communityStore';

/**
 * The admin's list of corporations whose Corp Tax Book shares moon pops with this Community
 * (#6223), each with Block / Unblock. A blocked corporation's pops show to no Member here until
 * unblocked. Listed while its settings name the Community, even between extractions; one whose
 * pops show to nobody here yet (no officer of its book is a Member) is marked Not showing.
 * Shows nothing until a corporation shares, or has been blocked.
 */
export function CommunityPopSharers({
  communityId,
  characterId,
}: {
  communityId: string;
  characterId: number;
}) {
  const { t } = useTranslation();
  const [sharers, setSharers] = useState<CommunityPopSharer[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const names = usePartyNames((sharers ?? []).map((s) => s.corporationId));

  useEffect(() => {
    let cancelled = false;
    listCommunityPopSharers(characterId, communityId).then(
      (list) => !cancelled && setSharers(list),
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId]);

  if (!sharers || sharers.length === 0) return null;

  async function toggle(sharer: CommunityPopSharer) {
    setBusy(sharer.corporationId);
    setFailed(false);
    try {
      await setCommunityPopSharingBlock(
        characterId,
        communityId,
        sharer.corporationId,
        !sharer.blocked
      );
      setSharers((list) =>
        (list ?? []).map((s) =>
          s.corporationId === sharer.corporationId ? { ...s, blocked: !sharer.blocked } : s
        )
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-4 space-y-2" aria-label={t('communities.popSharing.title')}>
      <h3 className="text-xs font-semibold">{t('communities.popSharing.title')}</h3>
      <p className="text-xs text-text-dim">{t('communities.popSharing.hint')}</p>
      <ul className="space-y-1">
        {sharers.map((s) => (
          <li key={s.corporationId} className="flex min-h-9 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm">
              {names.get(s.corporationId) ?? String(s.corporationId)}
              {s.blocked ? (
                <>
                  {' '}
                  <Pill tone="warning">{t('communities.popSharing.blocked')}</Pill>
                </>
              ) : (
                !s.sharing && (
                  <>
                    {' '}
                    <Pill>{t('communities.popSharing.notShowing')}</Pill>
                  </>
                )
              )}
            </span>
            <NeedsConnection>
              <Button
                size="sm"
                aria-disabled={busy !== null || undefined}
                onClick={() => void toggle(s)}
              >
                {t(s.blocked ? 'communities.popSharing.unblock' : 'communities.popSharing.block')}
              </Button>
            </NeedsConnection>
          </li>
        ))}
      </ul>
      {failed && <InlineError>{t('communities.popSharing.failed')}</InlineError>}
    </section>
  );
}
