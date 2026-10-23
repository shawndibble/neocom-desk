import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, Modal, TextArea, TextInput } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { ClaimStatePill } from './MemberClaimsList';
import { canRefile, type MemberClaim } from './srpMemberModel';

const TIMELINE_KEY: Record<MemberClaim['state'], string> = {
  pending: 'srpMember.detail.timeline.pending',
  approved: 'srpMember.detail.timeline.approved',
  paid: 'srpMember.detail.timeline.paid',
  rejected: 'srpMember.detail.timeline.rejected',
};

interface RefileDialogProps {
  claim: MemberClaim;
  hullName: string;
  busy: boolean;
  /** A refusal, already translated. */
  error?: string;
  /** The corp requires a Fleet or FC and the original claim named none: ask for it here. */
  needsFleet: boolean;
  onSubmit: (note: string, fleetOrFc?: string) => void;
  onClose: () => void;
}

/** Re-file a Rejected claim once, with a note for the officer. A bottom sheet on a phone. */
export function RefileDialog({
  claim,
  hullName,
  busy,
  error,
  needsFleet,
  onSubmit,
  onClose,
}: RefileDialogProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const noteId = useId();
  const errId = `${noteId}-err`;
  const [note, setNote] = useState('');
  const [fleet, setFleet] = useState('');
  const fleetId = useId();
  return (
    <Modal
      open
      onClose={onClose}
      placement={phone ? 'sheet' : 'center'}
      title={t('srpMember.refile.title', { hull: hullName })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
            {t('srpMember.refile.cancel')}
          </Button>
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            disabled={busy || note.trim() === '' || (needsFleet && fleet.trim() === '')}
            onClick={() => onSubmit(note.trim(), needsFleet ? fleet.trim() : undefined)}
          >
            {t('srpMember.refile.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-dim">
          {claim.rejectionReason
            ? `${t('srpMember.refile.rejected', { reason: claim.rejectionReason })} `
            : ''}
          {t('srpMember.refile.once')}
        </p>
        <label htmlFor={noteId} className="block space-y-1">
          <span className="text-xs text-text-dim">{t('srpMember.refile.note')}</span>
          <TextArea
            id={noteId}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
          />
        </label>
        {needsFleet ? (
          <label htmlFor={fleetId} className="block space-y-1">
            <span className="text-xs text-text-dim">{t('srpMember.file.fleet')}</span>
            <TextInput
              id={fleetId}
              value={fleet}
              onChange={(e) => setFleet(e.target.value)}
              placeholder={t('srpMember.file.fleetPlaceholder')}
              className="w-full"
              autoComplete="off"
              aria-required
            />
          </label>
        ) : null}
        {error ? <FieldError id={errId}>{error}</FieldError> : null}
      </div>
    </Modal>
  );
}

interface ClaimDetailDialogProps {
  claim: MemberClaim;
  hullName: string;
  systemName: string;
  onRefile: () => void;
  onClose: () => void;
}

/** A tapped claim: state, exact amount, the full reason, a short timeline and the killmail. */
export function ClaimDetailDialog({
  claim,
  hullName,
  systemName,
  onRefile,
  onClose,
}: ClaimDetailDialogProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const timeZone = useTimeZone();
  const date = (ms: number) => formatDateOnly(new Date(ms), timeZone);
  const timeline = [
    t('srpMember.detail.timeline.filed', { date: date(claim.filedAt) }),
    t(TIMELINE_KEY[claim.state]),
  ];
  return (
    <Modal
      open
      onClose={onClose}
      placement={phone ? 'sheet' : 'center'}
      title={hullName}
      footer={
        canRefile(claim) ? (
          <Button variant="primary" className="min-h-11 w-full sm:w-auto" onClick={onRefile}>
            {t('srpMember.claims.refile')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <ClaimStatePill state={claim.state} />
          <span className="text-text-dim">
            {claim.amount === null
              ? t('srpMember.claims.officerWillSet')
              : `${formatIsk(claim.amount)} ISK`}
          </span>
        </div>
        <p className="text-text-dim">
          {t('srpMember.detail.lostIn', { date: date(claim.killedAt), system: systemName })}
        </p>
        {claim.rejectionReason ? (
          <p>
            <span className="font-semibold text-danger">{t('srpMember.claims.reasonLabel')}</span>{' '}
            {claim.rejectionReason}
          </p>
        ) : null}
        <ol className="space-y-1 border-l border-line pl-3">
          {timeline.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <ExternalLink href={`https://zkillboard.com/kill/${claim.killmailId}/`}>
          {t('srpMember.detail.viewKillmail')}
        </ExternalLink>
      </div>
    </Modal>
  );
}
