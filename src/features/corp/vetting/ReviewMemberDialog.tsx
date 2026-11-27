import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput, LiveNote } from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import type { VettingReviewSummary } from '@/engine/vetting';
import type { MailRun } from '@/features/corpTaxBook/officerMail';
import { InlineError } from '@/components/ui/InlineError';
import { callableErrorReason } from '@/lib/callableError';
import { useIsPhone } from '@/lib/useIsPhone';
import { MemberCombobox, PickedMember } from './MemberCombobox';
import { RoleField } from './RoleField';
import { pickable, type RosterMember } from './reviewRoster';
import { TellMemberStep } from './TellMemberStep';
import type { ReviewRosterState } from './useReviewRoster';
import type { RequestMailPreview } from './useVettingRequestMail';
import { reviewKindLabel } from './vettingText';
import { vettingErrorKey } from './vettingView';
import { DialogFooter } from '@/components/ui/DialogFooter';

interface ReviewMemberDialogProps {
  onClose: () => void;
  roster: ReviewRosterState;
  mark: (members: readonly RosterMember[]) => RosterMember[];
  onRequest: (memberName: string, role: string) => Promise<VettingReviewSummary | null>;
  mail?: {
    officerId: number;
    officerName: string;
    send: (review: VettingReviewSummary) => Promise<MailRun>;
    preview: (review: VettingReviewSummary) => Promise<RequestMailPreview | null>;
  };
}

export function ReviewMemberDialog({
  onClose,
  roster,
  mark,
  onRequest,
  mail,
}: ReviewMemberDialogProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<RosterMember | null>(null);
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<VettingReviewSummary | null>(null);
  const listed = roster.status === 'ready';
  const members = roster.status === 'ready' ? mark(roster.roster.members) : [];
  const who = listed ? (picked && pickable(picked) ? picked.name : '') : name.trim();
  const ready = who.length > 0 && role.trim().length > 0;
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await onRequest(who, role.trim());
      if (created && mail) setAsked(created);
      else onClose();
    } catch (err) {
      setError(t(vettingErrorKey(callableErrorReason(err))));
    } finally {
      setBusy(false);
    }
  };
  if (asked && mail) {
    return (
      <Modal
        open
        onClose={onClose}
        title={t('vetting.tell.title')}
        dismissOnOutsidePress={false}
        footer={
          <div className="flex justify-end gap-2 [&>button]:max-sm:w-full">
            <Button variant="ghost" onClick={onClose}>
              {t('vetting.tell.done')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <CharacterAvatar characterId={asked.pilot.characterId} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{asked.pilot.name}</span>
              <span className="block truncate text-xs text-text-dim">
                {reviewKindLabel(asked, t)}
              </span>
            </span>
            <Pill>{t('vetting.tell.waitingFor', { name: asked.pilot.name.split(' ')[0] })}</Pill>
          </div>
          <TellMemberStep
            name={asked.pilot.name}
            officerId={mail.officerId}
            officerName={mail.officerName}
            send={() => mail.send(asked)}
            preview={() => mail.preview(asked)}
          />
        </div>
      </Modal>
    );
  }
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
      dismissOnOutsidePress={false}
      initialFocusRef={nameRef}
      footer={<DialogFooter stacked={phone}>{buttons}</DialogFooter>}
    >
      <form
        className="space-y-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {roster.status === 'loading' ? (
          <LiveNote className="text-xs text-text-dim">{t('vetting.member.loading')}</LiveNote>
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
