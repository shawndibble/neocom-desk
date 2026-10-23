import { useId, type FormEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, FieldError, Fields, TextInput } from '@/components/ui';
import { cx } from '@/lib/cx';
import type { DoctrineCheckRecord } from '../srpTypes';
import { DoctrineCheckView } from './DoctrineCheckView';
import { NotCoveredNote } from './NotCoveredNote';

export interface FileFormErrors {
  link?: string;
  fleet?: string;
  /** Nothing a field can fix: SRP is off, the network failed. */
  form?: string;
  /** The corp does not cover the pasted hull. */
  notCovered?: boolean;
}

interface MemberFileFormProps {
  link: string;
  onLink: (value: string) => void;
  fleet: string;
  onFleet: (value: string) => void;
  fleetRef: RefObject<HTMLInputElement | null>;
  /** The corp made Fleet or FC required. */
  fleetRequired: boolean;
  windowDays: number;
  errors: FileFormErrors;
  /** The doctrine check of the link above, once read; a hull the corp does not check has none. */
  doctrine?: { check: DoctrineCheckRecord | undefined; checking: boolean };
  busy: boolean;
  onSubmit: () => void;
  /** Phone: the button spans the width and the hint line goes. */
  fullWidth?: boolean;
}

/** Paste a killmail link, optional (or required) Fleet or FC, File claim. The server fills in the rest. */
export function MemberFileForm({
  link,
  onLink,
  fleet,
  onFleet,
  fleetRef,
  fleetRequired,
  windowDays,
  errors,
  doctrine,
  busy,
  onSubmit,
  fullWidth = false,
}: MemberFileFormProps) {
  const { t } = useTranslation();
  const linkId = useId();
  const fleetId = useId();
  const linkErr = `${linkId}-err`;
  const fleetErr = `${fleetId}-err`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <Fields variant="form">
        <Field
          label={t('srpMember.file.link')}
          htmlFor={linkId}
          note={
            errors.link ? (
              <FieldError id={linkErr}>{errors.link}</FieldError>
            ) : (
              t('srpMember.file.linkNote', { days: windowDays })
            )
          }
        >
          <TextInput
            id={linkId}
            value={link}
            onChange={(e) => onLink(e.target.value)}
            placeholder={t('srpMember.file.linkPlaceholder')}
            className="w-full max-w-xl"
            inputMode="url"
            autoComplete="off"
            aria-invalid={errors.link ? true : undefined}
            aria-describedby={errors.link ? linkErr : undefined}
          />
        </Field>
        <Field
          label={fleetRequired ? t('srpMember.file.fleet') : t('srpMember.file.fleetOptional')}
          htmlFor={fleetId}
          note={
            errors.fleet ? (
              <FieldError id={fleetErr}>{errors.fleet}</FieldError>
            ) : fleetRequired ? (
              t('srpMember.file.fleetNoteRequired')
            ) : (
              t('srpMember.file.fleetNote')
            )
          }
        >
          <TextInput
            id={fleetId}
            ref={fleetRef}
            value={fleet}
            onChange={(e) => onFleet(e.target.value)}
            placeholder={t('srpMember.file.fleetPlaceholder')}
            className="w-full max-w-xl"
            autoComplete="off"
            aria-required={fleetRequired || undefined}
            aria-invalid={errors.fleet ? true : undefined}
            aria-describedby={errors.fleet ? fleetErr : undefined}
          />
        </Field>
      </Fields>
      <div aria-live="polite">
        {doctrine?.checking ? (
          <p className="text-xs text-text-dim">{t('srpMember.file.doctrineChecking')}</p>
        ) : (
          <DoctrineCheckView check={doctrine?.check} audience="pilot" />
        )}
      </div>
      {errors.notCovered ? <NotCoveredNote /> : null}
      {errors.form ? (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={busy || link.trim() === ''}
          className={cx(fullWidth && 'min-h-11 w-full')}
        >
          {busy ? t('srpMember.file.filing') : t('srpMember.file.submit')}
        </Button>
        {fullWidth ? null : (
          <span className="text-xs text-text-dim">{t('srpMember.file.hint')}</span>
        )}
      </div>
    </form>
  );
}
