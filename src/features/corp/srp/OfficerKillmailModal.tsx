/** The officer's read-only killmail, opened over a claim's slide-over: facts, the fit with doctrine marks, the appraisal comparison. */
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import type { DoctrineCheckRecord, SrpClaimValues } from '../srpTypes';
import {
  AppraisalComparison,
  SrpKillmailView,
  type KillmailSubject,
  type Read,
} from './SrpKillmailView';

interface Props {
  subject: KillmailSubject;
  check: DoctrineCheckRecord | undefined;
  values: Read<SrpClaimValues>;
  onClose: () => void;
}

export function OfficerKillmailModal({ subject, check, values, onClose }: Props) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const ready = typeof values === 'object' ? values : null;
  return (
    <Modal
      open
      onClose={onClose}
      placement={phone ? 'sheet' : 'medium'}
      title={subject.hullName}
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
            {t('srpKillmail.close')}
          </Button>
        </div>
      }
    >
      <SrpKillmailView
        subject={subject}
        check={check}
        values={
          ready
            ? { killmailValue: null, hullValue: ready.hullValue, fitValue: ready.fitValue }
            : null
        }
        top={<AppraisalComparison values={values} />}
      />
    </Modal>
  );
}
