import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, FieldError, Modal, TextInput } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import type { DoctrineCheckRecord } from '../srpTypes';
import { DoctrineCheckView } from './DoctrineCheckView';

interface Props {
  hullName: string;
  check: DoctrineCheckRecord;
  fleet: string;
  onFleet: (value: string) => void;
  fleetRequired: boolean;
  onFileAnyway: () => void;
  onClose: () => void;
}

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
  const fleetErr = `${fleetId}-err`;
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
          note={
            blocked ? (
              <FieldError id={fleetErr}>{t('srpMember.errors.fleetOrFcRequired')}</FieldError>
            ) : undefined
          }
        >
          <TextInput
            id={fleetId}
            value={fleet}
            onChange={(e) => onFleet(e.target.value)}
            placeholder={t('srpMember.file.fleetPlaceholder')}
            className="w-full"
            autoComplete="off"
            aria-required={fleetRequired || undefined}
            aria-invalid={blocked || undefined}
            aria-describedby={blocked ? fleetErr : undefined}
          />
        </Field>
      </div>
    </Modal>
  );
}
