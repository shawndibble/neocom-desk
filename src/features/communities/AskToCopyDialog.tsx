import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, NativeSelect, Spinner } from '@/components/ui';
import { askToCopyPrefill, type AskToCopyOffer } from '@/engine/communities/askToCopy';
import { uidForCharacter } from '@/sync/uid';
import { ComposeRequestDialog } from './ComposeRequestDialog';
import { loadCommunityMembers, type CommunityMember } from './communityStore';

/**
 * "Ask <name> to copy" from a Community Offer row of BPC Sourcing (issue
 * #3813): the Requests tab's own compose dialog, opened in place with one BPC
 * line of that blueprint (quantity 1, no runs/ME/TE ask) and the holder
 * ticked on step 2. Posting is the dialog's own: same callable, caps, mail and
 * results as the Requests tab. A Member who shares the blueprint in several
 * Communities picks which one it is posted to first; the Offer's one
 * Community goes straight to compose. The Request lands on that Community's
 * board; this page has no board to refresh.
 */
export function AskToCopyDialog({
  characterId,
  offer,
  blueprintName,
  holderName,
  onClose,
}: {
  characterId: number;
  offer: AskToCopyOffer;
  blueprintName: string;
  holderName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const selectId = useId();
  const communities = offer.communities ?? [];
  const [chosen, setChosen] = useState<string | null>(
    communities.length === 1 ? communities[0].id : null
  );
  const [pick, setPick] = useState(communities[0]?.id ?? '');

  if (chosen === null) {
    return (
      <Modal open onClose={onClose} title={t('communities.askToCopy.title', { name: holderName })}>
        <p className="text-xs text-text-dim">
          {t('communities.askToCopy.pickHint', { name: holderName, blueprint: blueprintName })}
        </p>
        <label htmlFor={selectId} className="mt-3 mb-1 block text-xs font-medium">
          {t('communities.askToCopy.community')}
        </label>
        <NativeSelect id={selectId} value={pick} onChange={(e) => setPick(e.target.value)}>
          {communities.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </NativeSelect>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            {t('communities.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={pick === ''}
            onClick={() => setChosen(pick)}
          >
            {t('communities.askToCopy.continue')}
          </Button>
        </div>
      </Modal>
    );
  }
  return (
    <AskToCopyCompose
      key={chosen}
      characterId={characterId}
      communityId={chosen}
      offer={offer}
      blueprintName={blueprintName}
      holderName={holderName}
      onClose={onClose}
    />
  );
}

/** Reads the chosen Community's roster (compose step 2 needs it), then opens compose. */
function AskToCopyCompose({
  characterId,
  communityId,
  offer,
  blueprintName,
  holderName,
  onClose,
}: {
  characterId: number;
  communityId: string;
  offer: AskToCopyOffer;
  blueprintName: string;
  holderName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCommunityMembers(characterId, communityId).then(
      (loaded) => {
        if (!cancelled) setMembers(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId]);

  if (failed) {
    return (
      <Modal open onClose={onClose} title={t('communities.askToCopy.title', { name: holderName })}>
        <p role="alert" className="text-xs text-danger">
          {t('communities.askToCopy.membersFailed')}
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onClose}>
            {t('communities.askToCopy.close')}
          </Button>
        </div>
      </Modal>
    );
  }
  if (members === null) {
    return (
      <Modal open onClose={onClose} title={t('communities.askToCopy.title', { name: holderName })}>
        <Spinner size="sm" label={t('communities.loading')} />
      </Modal>
    );
  }
  return (
    <ComposeRequestDialog
      characterId={characterId}
      communityId={communityId}
      myUid={uidForCharacter(characterId)}
      members={members}
      prefill={askToCopyPrefill(offer, blueprintName)}
      onClose={onClose}
      onPosted={() => undefined}
    />
  );
}
