import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, NativeSelect, Tooltip } from '@/components/ui';
import { askToCopyPrefill, type AskToCopyOffer } from '@/engine/communities/askToCopy';
import { ComposeRequestDialog } from './ComposeRequestDialog';
import { DialogFooter } from '@/components/ui/DialogFooter';

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
        <DialogFooter className="mt-3">
          <Button onClick={onClose}>{t('communities.cancel')}</Button>
          <Tooltip content={pick === '' ? t('common.nothingSelected') : null}>
            <Button
              variant="primary"
              aria-disabled={pick === '' || undefined}
              onClick={() => setChosen(pick)}
            >
              {t('communities.askToCopy.continue')}
            </Button>
          </Tooltip>
        </DialogFooter>
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
      onPosted={() => undefined}
    />
  );
}

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
