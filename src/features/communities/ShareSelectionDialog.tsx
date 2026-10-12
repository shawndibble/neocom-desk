import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { CharacterSharePicker } from './SharePicker';
import { loadShareSelection, saveShareSelection } from './shareSelection';

/**
 * Edits which blueprints one Character shares with one Community (issue
 * #3599) after joining. The choice is saved on this device; the push that
 * publishes it to the Community is separate (#3600).
 */
export function ShareSelectionDialog({
  open,
  characterId,
  characterName,
  communityId,
  onClose,
  onSaved,
}: {
  open: boolean;
  characterId: number;
  characterName: string;
  communityId: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ReadonlySet<number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadShareSelection(characterId, communityId).then((saved) => {
      if (!cancelled) setDraft(saved);
    });
    return () => {
      cancelled = true;
      setDraft(null);
    };
  }, [open, characterId, communityId]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFailed(false);
    try {
      await saveShareSelection(characterId, communityId, draft);
      onSaved(draft.size);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t('communities.share.dialogTitle', { name: characterName })}
    >
      <p className="mb-2 text-xs text-text-dim">{t('communities.share.dialogHint')}</p>
      {draft && (
        <CharacterSharePicker
          characterId={characterId}
          selected={draft}
          onChange={setDraft}
          disabled={saving}
        />
      )}
      {failed && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {t('communities.share.saveFailed')}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" disabled={saving} onClick={onClose}>
          {t('communities.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!draft}
          onClick={() => void save()}
        >
          {t('communities.share.save')}
        </Button>
      </div>
    </Modal>
  );
}
