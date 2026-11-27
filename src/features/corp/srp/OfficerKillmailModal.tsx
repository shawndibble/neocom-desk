import { Modal } from '@/components/ui';
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
  const ready = typeof values === 'object' ? values : null;
  return (
    <Modal open onClose={onClose} placement="medium" title={subject.hullName}>
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
