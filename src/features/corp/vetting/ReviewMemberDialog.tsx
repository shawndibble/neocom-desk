import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { callableErrorReason } from '@/lib/callableError';
import { useIsPhone } from '@/lib/useIsPhone';
import { vettingErrorKey } from './vettingView';

/** Longest role name the server keeps (`VETTING_ROLE_MAX` in functions/src/vettingTypes.ts). */
const ROLE_MAX = 40;

interface ReviewMemberDialogProps {
  onClose: () => void;
  /** Asks the member for a review; rejects with the server's refusal. */
  onRequest: (memberName: string, role: string) => Promise<void>;
}

/**
 * "Review a member…": ask a member for a review before a promotion. The exact in-game name and
 * the role they are up for. Whoever asks cannot sign the review off, which the dialog says.
 */
export function ReviewMemberDialog({ onClose, onRequest }: ReviewMemberDialogProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0 && role.trim().length > 0;
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRequest(name.trim(), role.trim());
      onClose();
    } catch (err) {
      setError(t(vettingErrorKey(callableErrorReason(err))));
    } finally {
      setBusy(false);
    }
  };
  const buttons = (
    <>
      <Button variant="ghost" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        loading={busy}
        aria-disabled={!ready || undefined}
        onClick={ready ? () => void submit() : undefined}
      >
        {t('vetting.requestDialog.confirm')}
      </Button>
    </>
  );
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={t('vetting.requestDialog.title')}
      placement={phone ? 'sheet' : 'center'}
      dismissOnOutsidePress={false}
      initialFocusRef={nameRef}
      footer={
        phone ? (
          <div className="flex flex-col-reverse gap-2 [&>button]:w-full">{buttons}</div>
        ) : (
          <div className="flex justify-end gap-2">{buttons}</div>
        )
      }
    >
      <form
        className="space-y-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block space-y-1">
          <span className="text-xs text-text-dim">{t('vetting.requestDialog.name')}</span>
          <TextInput
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-text-dim">{t('vetting.requestDialog.role')}</span>
          <TextInput
            value={role}
            maxLength={ROLE_MAX}
            onChange={(event) => setRole(event.target.value)}
            autoComplete="off"
          />
        </label>
        {error && <InlineError>{error}</InlineError>}
        <p className="text-xs text-text-dim">{t('vetting.requestDialog.note')}</p>
      </form>
    </Modal>
  );
}
