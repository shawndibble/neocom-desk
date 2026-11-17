import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { callableErrorReason } from '@/lib/callableError';
import { useIsPhone } from '@/lib/useIsPhone';
import { MemberCombobox, PickedMember } from './MemberCombobox';
import { RoleField } from './RoleField';
import { pickable, type RosterMember } from './reviewRoster';
import type { ReviewRosterState } from './useReviewRoster';
import { vettingErrorKey } from './vettingView';

interface ReviewMemberDialogProps {
  onClose: () => void;
  /** The corporation's members; unreadable falls back to the exact-name field. */
  roster: ReviewRosterState;
  /** Members flagged (waiting review, the officer) before they reach the list. */
  mark: (members: readonly RosterMember[]) => RosterMember[];
  /** Asks the member for a review; rejects with the server's refusal. */
  onRequest: (memberName: string, role: string) => Promise<void>;
}

/**
 * "Review a member…": ask a member for a review before a promotion. The exact in-game name and
 * the role they are up for. Whoever asks cannot sign the review off, which the dialog says.
 */
export function ReviewMemberDialog({ onClose, roster, mark, onRequest }: ReviewMemberDialogProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<RosterMember | null>(null);
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listed = roster.status === 'ready';
  const members = roster.status === 'ready' ? mark(roster.roster.members) : [];
  const who = listed ? (picked && pickable(picked) ? picked.name : '') : name.trim();
  const ready = who.length > 0 && role.trim().length > 0;
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRequest(who, role.trim());
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
        {roster.status === 'loading' ? (
          <p className="text-xs text-text-dim" role="status">
            {t('vetting.member.loading')}
          </p>
        ) : roster.status === 'ready' ? (
          picked ? (
            <PickedMember member={picked} onChange={() => setPicked(null)} />
          ) : (
            <MemberCombobox
              inputRef={nameRef}
              members={members}
              query={name}
              onQuery={setName}
              onPick={setPicked}
            />
          )
        ) : (
          <div className="space-y-1">
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
            <p className="text-xs text-text-dim">{t('vetting.member.unreadable')}</p>
          </div>
        )}
        <RoleField
          value={role}
          onChange={setRole}
          corpTitles={roster.status === 'ready' ? roster.roster.titles : []}
        />
        {error && <InlineError>{error}</InlineError>}
        <p className="text-xs text-text-dim">{t('vetting.requestDialog.note')}</p>
      </form>
    </Modal>
  );
}
