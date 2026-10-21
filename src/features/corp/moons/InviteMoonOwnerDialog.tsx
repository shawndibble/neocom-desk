import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  createFeederInvite,
  inviteLink,
  listFeederInvites,
  revokeFeederInvite,
  type OpenInvite,
} from '../taxBook/feederClient';
import { parseRequestedRate } from '../taxBook/feederViewModel';
import { Label } from './BookDialogs';
import { callableErrorText } from './feederErrorText';
import { InviteLinkField } from './InviteLinkField';
import { shortDate } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.moonOwners.dialogs.invite.${key}`;

/**
 * Invite a moon owner: make a link (optionally offering a rate), copy it, and
 * revoke open links. Only its id is stored for an older link, never the code,
 * so only a link made in this dialog can be copied.
 */
export function InviteMoonOwnerDialog({
  characterId,
  corporationId,
  characterName,
  onClose,
}: {
  characterId: number;
  corporationId: number;
  characterName: (id: number) => string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [invites, setInvites] = useState<OpenInvite[] | null>(null);
  const [offer, setOffer] = useState('');
  const [link, setLink] = useState<{ url: string; inviteId: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(
    () => listFeederInvites(characterId, corporationId),
    [characterId, corporationId]
  );
  useEffect(() => {
    let cancelled = false;
    fetchInvites().then(
      (list) => {
        if (!cancelled) setInvites(list);
      },
      (e) => {
        if (cancelled) return;
        setInvites([]);
        setError(callableErrorText(t, e, k('loadFailed')));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fetchInvites, t]);
  const refresh = async () => {
    try {
      setInvites(await fetchInvites());
    } catch {
      setError(t(k('loadFailed')));
    }
  };

  const offered = offer.trim() === '' ? undefined : parseRequestedRate(offer);
  const canMake = offered !== null && !busy;

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code, inviteId } = await createFeederInvite(
        characterId,
        corporationId,
        offered ?? undefined
      );
      setLink({ url: inviteLink(window.location.origin, code), inviteId });
      await refresh();
    } catch (e) {
      setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (inviteId: string) => {
    setError(null);
    setRevoking(inviteId);
    try {
      await revokeFeederInvite(characterId, corporationId, inviteId);
      // A revoked link is dead: stop offering it for copying.
      if (link?.inviteId === inviteId) setLink(null);
      await refresh();
    } catch (e) {
      setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t(k('title'))}
      placement={phone ? 'sheet' : 'center'}
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {t(k('done'))}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-dim">{t(k('intro'))}</p>
        <Label text={t(k('offer'))}>
          <TextInput inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} />
        </Label>
        <Button onClick={() => void make()} disabled={!canMake}>
          {t(k('make'))}
        </Button>
        {link !== null && (
          <div className="space-y-2">
            <InviteLinkField url={link.url} />
            <p className="text-xs text-text-dim">{t(k('warning'))}</p>
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wider text-text-dim uppercase">
            {t(k('open'))}
          </h3>
          {invites !== null && invites.length === 0 && (
            <p className="text-text-dim">{t(k('none'))}</p>
          )}
          <ul className="divide-y divide-line">
            {(invites ?? []).map((i) => (
              <li key={i.inviteId} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {t(k('made'), {
                    date: shortDate(new Date(i.createdAt).toISOString()),
                    name: characterName(i.createdBy),
                  })}
                  {i.offeredOwnerRatePct !== undefined && (
                    <span className="text-text-dim">
                      {' · '}
                      {t(k('offering'), { pct: i.offeredOwnerRatePct })}
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t(k('revokeLabel'), {
                    date: shortDate(new Date(i.createdAt).toISOString()),
                  })}
                  loading={revoking === i.inviteId}
                  onClick={() => void revoke(i.inviteId)}
                >
                  {t(k('revoke'))}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-dim">{t(k('codeNote'))}</p>
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
