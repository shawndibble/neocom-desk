import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Modal, TextInput } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import type { DoctrineCheckRecord } from '../srpTypes';
import { DoctrineCheckView } from './DoctrineCheckView';

interface Props {
  hullName: string;
  check: DoctrineCheckRecord;
  /** The Fleet or FC text, shared with the paste form so a note typed in either carries over. */
  fleet: string;
  onFleet: (value: string) => void;
  fleetRequired: boolean;
  onFileAnyway: () => void;
  onClose: () => void;
}

/**
 * What a lost ship's File asks first when its fit is off doctrine: the check's detail, an
 * optional (or required) Fleet or FC, then File anyway or Cancel. An on-doctrine loss never opens it.
 */
export function OffDoctrineFileDialog({
  hullName,
  check,
  fleet,
  onFleet,
  fleetRequired,
  onFileAnyway,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const fleetId = useId();
  const blocked = fleetRequired && fleet.trim() === '';
  return (
    <Modal
      open
      onClose={onClose}
      placement={phone ? 'sheet' : 'center'}
      title={t('srpMember.offDoctrine.title', { hull: hullName })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            aria-disabled={blocked || undefined}
            onClick={blocked ? undefined : onFileAnyway}
          >
            {t('srpMember.offDoctrine.fileAnyway')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <DoctrineCheckView check={check} audience="pilot" />
        <Field
          label={fleetRequired ? t('srpMember.file.fleet') : t('srpMember.file.fleetOptional')}
          htmlFor={fleetId}
        >
          <TextInput
            id={fleetId}
            value={fleet}
            onChange={(e) => onFleet(e.target.value)}
            placeholder={t('srpMember.file.fleetPlaceholder')}
            className="w-full"
            autoComplete="off"
            aria-required={fleetRequired || undefined}
          />
        </Field>
      </div>
    </Modal>
  );
}
