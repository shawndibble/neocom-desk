import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, NeedsConnection } from '@/components/ui';
import { useOnline } from '@/stores/network';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { MailInvitePanel } from './MailInvitePanel';
import { communityInviteUrl, setRequireApproval, type CommunitySummary } from './communityStore';

/**
 * The admin's Invites tab: the invite link (copy, regenerate, revoke), mail
 * invites by character name, and "Approve new Members". With approval on,
 * anyone joining by the link waits on the Members tab until the admin lets
 * them in; a Character the admin mailed an invite goes straight in.
 */
export function CommunityInvites({
  community,
  characterId,
  onCopy,
  onRegenerate,
  onRevoke,
  onPatch,
}: {
  community: CommunitySummary;
  characterId: number;
  onCopy: (url: string) => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  onPatch: (patch: Partial<CommunitySummary>) => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const inviteUrl = community.inviteCode ? communityInviteUrl(community.inviteCode) : null;
  const approval = community.requireApproval === true;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function changeApproval(next: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      await setRequireApproval(characterId, community.id, next);
      onPatch({ requireApproval: next });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-1" aria-label={t('communities.approval.title')}>
        <label className={`flex items-start gap-2 text-xs ${tappableRowClassName}`}>
          <Checkbox
            checked={approval}
            disabled={saving || !online}
            onChange={(event) => void changeApproval(event.target.checked)}
          />
          <span>
            <span className="block font-medium">{t('communities.approval.title')}</span>
            <span className="block text-text-dim">{t('communities.approval.hint')}</span>
          </span>
        </label>
        {failed && (
          <p role="alert" className="text-xs text-danger">
            {t('communities.approval.failed')}
          </p>
        )}
      </section>

      <section className="space-y-2" aria-label={t('communities.invite')}>
        <h3 className="text-xs font-semibold">{t('communities.invite')}</h3>
        {inviteUrl ? (
          <>
            <p className="text-xs text-text-dim">{t('communities.inviteHint')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xs bg-panel-2 px-2 py-1 text-xs">
                {inviteUrl}
              </code>
              <Button
                size="sm"
                variant="primary"
                data-invite-focus=""
                onClick={() => onCopy(inviteUrl)}
              >
                {t('communities.copyLink')}
              </Button>
              <NeedsConnection>
                <Button size="sm" onClick={onRegenerate}>
                  {t('communities.regenerate')}
                </Button>
              </NeedsConnection>
              <NeedsConnection>
                <Button size="sm" onClick={onRevoke}>
                  {t('communities.revoke')}
                </Button>
              </NeedsConnection>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-text-dim">{t('communities.inviteOff')}</p>
            <NeedsConnection>
              <Button size="sm" data-invite-focus="" onClick={onRegenerate}>
                {t('communities.regenerate')}
              </Button>
            </NeedsConnection>
          </div>
        )}
      </section>
      {inviteUrl && <MailInvitePanel community={community} characterId={characterId} />}
    </div>
  );
}
