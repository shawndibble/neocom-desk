import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, Modal, TextInput } from '@/components/ui';
import { createCommunity } from './communityStore';
import { callableErrorCode } from './callableError';

const MAX_NAME_LENGTH = 60;

/** Names a new Community; the creating Character becomes its admin and first Member. */
export function CreateCommunityDialog({
  open,
  characterId,
  characterName,
  onClose,
  onCreated,
}: {
  open: boolean;
  characterId: number;
  characterName: string;
  onClose: () => void;
  onCreated: (communityId: string) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<'tooMany' | 'failed' | null>(null);
  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || !characterName || working) return;
    setWorking(true);
    setError(null);
    try {
      const { communityId } = await createCommunity(characterId, trimmed, characterName);
      setName('');
      onCreated(communityId);
      onClose();
    } catch (err) {
      setError(callableErrorCode(err) === 'resource-exhausted' ? 'tooMany' : 'failed');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!working) onClose();
      }}
      title={t('communities.createTitle')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Fields>
          <Field label={t('communities.nameLabel')} htmlFor={`${formId}-name`}>
            <TextInput
              id={`${formId}-name`}
              className="w-full"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </Fields>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {t(error === 'tooMany' ? 'communities.tooMany' : 'communities.createFailed')}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" disabled={working} onClick={onClose}>
            {t('communities.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={working}
            disabled={!trimmed || !characterName}
          >
            {t('communities.createAction')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
