import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, NativeSelect } from '@/components/ui';
import { askToCopyPrefill, type AskToCopyOffer } from '@/engine/communities/askToCopy';
import { ComposeRequestDialog } from './ComposeRequestDialog';

/**
 * "Ask <name> to copy" from a Community Offer row of BPC Sourcing (issue
 * #3813): the Requests tab's own compose dialog, opened in place with one BPC
 * line of that blueprint (quantity 1, no runs/ME/TE ask). Posting is the
 * dialog's own: same callable and caps as the Requests tab; the holder is not
 * mailed, they see it on the board like everyone else. A Member who shares the blueprint in several
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
  const communities = offer.communities;
  const [chosen, setChosen] = useState<string | null>(
    communities.length === 1 ? communities[0].id : null
  );
  const [pick, setPick] = useState(communities[0]?.id ?? '');

  if (chosen === null) {
    return (
      <AskToCopyShell holderName={holderName} onClose={onClose}>
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
      </AskToCopyShell>
    );
  }
  return (
    <ComposeRequestDialog
      key={chosen}
      characterId={characterId}
      communityId={chosen}
      prefill={askToCopyPrefill(offer, blueprintName)}
      onClose={onClose}
      // no board on this page
      onPosted={() => undefined}
    />
  );
}

/** The small dialog the choice, the wait and the failure share. */
function AskToCopyShell({
  holderName,
  onClose,
  children,
}: {
  holderName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal open onClose={onClose} title={t('communities.askToCopy.title', { name: holderName })}>
      {children}
    </Modal>
  );
}
