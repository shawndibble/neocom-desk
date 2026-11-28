import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { Button, Modal, Spinner } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { repaymentHidden, shipFitValue } from '@/engine/srpAppraisal';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { formatIsk } from '@/lib/isk';
import type { DoctrineCheckRecord, DoctrinePreview } from '../srpTypes';
import { basisText } from './srpClaimText';
import { esiKillmailLink, isUsablePreview } from './srpMemberModel';
import {
  OffDoctrineLine,
  SrpKillmailView,
  type KillmailSubject,
  type Read,
} from './SrpKillmailView';

interface Props {
  subject: KillmailSubject;
  canFile: boolean;
  busy: boolean;
  previewDoctrine: (killmail: string) => Promise<DoctrinePreview>;
  onFile: (check?: DoctrineCheckRecord) => void;
  onClose: () => void;
}

function usePreview(
  subject: KillmailSubject,
  previewDoctrine: Props['previewDoctrine']
): Read<DoctrinePreview> {
  const { killmailId, killmailHash } = subject;
  const load = useCallback(
    () => previewDoctrine(esiKillmailLink(killmailId, killmailHash)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [killmailId, killmailHash]
  );
  const read = useKeyedLoad(String(killmailId), load);
  if (read.status === 'failed') return 'failed';
  if (read.status !== 'ready') return 'loading';
  return isUsablePreview(read.data) ? read.data : 'failed';
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
  const preview = usePreview(subject, previewDoctrine);
  const ready = typeof preview === 'object' ? preview : null;
  const fileable = canFile && ready?.quote.kind !== 'not-covered';
  return (
    <Modal
      open
      onClose={onClose}
      placement="medium"
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
              loading={busy}
              onClick={() => onFile(ready?.check)}
            >
              {t('srpKillmail.file')}
            </Button>
          )}
        </div>
      }
    >
      <ErrorBoundary
        fallback={<p className="text-sm text-text-dim">{t('srpKillmail.openFailed')}</p>}
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
      </ErrorBoundary>
    </Modal>
  );
}
