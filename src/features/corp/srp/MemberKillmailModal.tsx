/** A pilot's own loss, opened from "Or pick a lost ship": the payout, the facts, the fit checked against doctrine, File claim. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Spinner } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { repaymentHidden, shipFitValue } from '@/engine/srpAppraisal';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import type { DoctrineCheckRecord, DoctrinePreview } from '../srpTypes';
import { basisText } from './srpClaimText';
import { esiKillmailLink } from './srpMemberModel';
import {
  OffDoctrineLine,
  SrpKillmailView,
  type KillmailSubject,
  type Read,
} from './SrpKillmailView';

interface Props {
  subject: KillmailSubject;
  /** Only an open loss can be filed. */
  canFile: boolean;
  busy: boolean;
  previewDoctrine: (killmail: string) => Promise<DoctrinePreview>;
  /** With the doctrine check the modal read, so filing need not read it again. */
  onFile: (check?: DoctrineCheckRecord) => void;
  onClose: () => void;
}

function usePreview(
  subject: KillmailSubject,
  previewDoctrine: Props['previewDoctrine']
): Read<DoctrinePreview> {
  const { killmailId, killmailHash } = subject;
  const [read, setRead] = useState<{ id: number; value: Read<DoctrinePreview> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    previewDoctrine(esiKillmailLink(killmailId, killmailHash)).then(
      (value) => !cancelled && setRead({ id: killmailId, value }),
      () => !cancelled && setRead({ id: killmailId, value: 'failed' })
    );
    return () => {
      cancelled = true;
    };
    // `previewDoctrine` is a stable callback of the page; the loss is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [killmailId, killmailHash]);
  return read?.id === killmailId ? read.value : 'loading';
}

function Payout({ preview }: { preview: Read<DoctrinePreview> }) {
  const { t } = useTranslation();
  if (preview === 'loading') return <Spinner size="sm" delayMs={200} />;
  if (preview === 'failed') {
    return <p className="text-sm text-text-dim">{t('srpKillmail.previewFailed')}</p>;
  }
  const { quote, values } = preview;
  if (quote.kind === 'not-covered') {
    return <Pill tone="danger">{t('srpMember.lost.notCovered')}</Pill>;
  }
  const hidden =
    quote.kind === 'amount' &&
    repaymentHidden(quote.isk, shipFitValue(values.hullValue, values.fitValue));
  if (quote.kind !== 'amount' || hidden) {
    return <p className="text-sm font-medium">{t('srpKillmail.officerWillReview')}</p>;
  }
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{formatIsk(quote.isk)}</span>
        <Pill tone="success">{t('srpKillmail.covered')}</Pill>
      </div>
      <p className="mt-1 text-xs text-text-dim">{basisText(t, quote.basis)}</p>
    </>
  );
}

export function MemberKillmailModal({
  subject,
  canFile,
  busy,
  previewDoctrine,
  onFile,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const preview = usePreview(subject, previewDoctrine);
  const ready = typeof preview === 'object' ? preview : null;
  const fileable = canFile && ready?.quote.kind !== 'not-covered';
  return (
    <Modal
      open
      onClose={onClose}
      placement={phone ? 'sheet' : 'medium'}
      title={subject.hullName}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
            {t('srpKillmail.close')}
          </Button>
          {fileable && (
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => onFile(ready?.check)}
            >
              {t('srpKillmail.file')}
            </Button>
          )}
        </div>
      }
    >
      <SrpKillmailView
        subject={subject}
        check={ready?.check}
        values={ready ? ready.values : null}
        top={
          <div>
            <Payout preview={preview} />
            <OffDoctrineLine check={ready?.check} />
          </div>
        }
      />
    </Modal>
  );
}
