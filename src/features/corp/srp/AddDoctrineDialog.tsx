import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Field,
  FieldError,
  Fields,
  NativeSelect,
  TextArea,
  TextInput,
} from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import type { LoadWarning } from '@/engine/fittings/load';
import type { DoctrineFitSnapshot } from '@/engine/srpDoctrine';
import type { Fitting } from '@/engine/fittings/types';
import { useSavedFittingRecords } from '@/features/fittings/useSavedFittingRecords';
import type { SaveDoctrineInput } from '../srpTypes';
import { doctrineShareCode, snapshotFromEft, doctrineFromFitting } from './doctrineSources';
import { useDoctrineTypeNames } from './useDoctrineTypeNames';
import { DialogFooter } from '@/components/ui/DialogFooter';

export type DoctrineSource = 'fitting' | 'eft';

interface Props {
  source: DoctrineSource;
  characterId: number;
  onAdd: (input: SaveDoctrineInput) => Promise<void>;
  onClose: () => void;
}

interface Parsed {
  snapshot: DoctrineFitSnapshot | null;
  fitting: Fitting | null;
  unresolved: LoadWarning[];
  failed: boolean;
}

const NONE: Parsed = { snapshot: null, fitting: null, unresolved: [], failed: false };

export function AddDoctrineDialog({ source, characterId, onAdd, onClose }: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fittings = useSavedFittingRecords(characterId);
  const [picked, setPicked] = useState('');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed>(NONE);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: Parsed) => !cancelled && setParsed(next);
    if (source === 'fitting') {
      const record = fittings?.find((f) => f.id === picked);
      if (!record) apply(NONE);
      else
        doctrineFromFitting(record).then(
          (read) =>
            apply({
              snapshot: read?.snapshot ?? null,
              fitting: read?.fitting ?? null,
              unresolved: [],
              failed: read === null,
            }),
          () => apply({ ...NONE, failed: true })
        );
    } else if (text.trim() === '') apply(NONE);
    else
      snapshotFromEft(text).then(
        (result) =>
          apply({
            snapshot: result.ok ? result.fit : null,
            fitting: result.ok ? result.fitting : null,
            unresolved: result.unresolved,
            failed: !result.ok,
          }),
        () => apply({ ...NONE, failed: true })
      );
    return () => {
      cancelled = true;
    };
  }, [source, picked, text, fittings]);

  const { snapshot, fitting, unresolved } = parsed;
  const typeName = useDoctrineTypeNames(snapshot ? [snapshot.hullTypeId] : []);
  const name = typedName ?? snapshot?.name ?? '';
  const canAdd = snapshot !== null && name.trim() !== '' && !busy;
  const none = source === 'fitting' && fittings !== undefined && fittings.length === 0;

  async function add() {
    if (!snapshot) return;
    setBusy(true);
    setFailed(false);
    try {
      const trimmed = name.trim();
      const shareCode = fitting ? await doctrineShareCode(fitting, trimmed) : undefined;
      await onAdd({ name: trimmed, snapshot, ...(shareCode ? { shareCode } : {}) });
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const pickId = `${uid}-pick`;
  const textId = `${uid}-eft`;
  const nameId = `${uid}-name`;
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={t(
        `srp.settings.doctrines.dialog.${source === 'fitting' ? 'fittingTitle' : 'eftTitle'}`
      )}
      initialFocusRef={source === 'fitting' ? selectRef : areaRef}
      placement="center"
      dirty={touched && !busy}
      footer={
        <DialogFooter>
          <Button size="sm" aria-disabled={busy || undefined} onClick={onClose}>
            {t('srp.settings.doctrines.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            aria-disabled={!canAdd || undefined}
            onClick={() => canAdd && void add()}
          >
            {busy
              ? t('srp.settings.doctrines.dialog.adding')
              : t('srp.settings.doctrines.dialog.add')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="grid gap-3" onInput={() => setTouched(true)}>
        <Fields variant="form">
          {source === 'fitting' ? (
            <Field
              label={t('srp.settings.doctrines.dialog.fittingLabel')}
              htmlFor={pickId}
              note={
                none
                  ? t('srp.settings.doctrines.dialog.fittingNone')
                  : t('srp.settings.doctrines.dialog.fittingNote')
              }
            >
              <NativeSelect
                id={pickId}
                ref={selectRef}
                className="w-full max-w-md"
                value={picked}
                disabled={none}
                onChange={(e) => {
                  setPicked(e.target.value);
                  setTypedName(null);
                }}
              >
                <option value="">{t('srp.settings.doctrines.dialog.fittingPick')}</option>
                {(fittings ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <Field
              label={t('srp.settings.doctrines.dialog.eftLabel')}
              htmlFor={textId}
              note={
                parsed.failed && text.trim() !== '' ? (
                  <FieldError id={`${textId}-err`}>
                    {t('srp.settings.doctrines.dialog.eftNoHull')}
                  </FieldError>
                ) : (
                  t('srp.settings.doctrines.dialog.eftNote')
                )
              }
            >
              <TextArea
                id={textId}
                ref={areaRef}
                mono
                rows={8}
                className="w-full"
                value={text}
                placeholder={t('srp.settings.doctrines.dialog.eftPlaceholder')}
                aria-invalid={parsed.failed && text.trim() !== '' ? true : undefined}
                aria-describedby={parsed.failed && text.trim() !== '' ? `${textId}-err` : undefined}
                onChange={(e) => {
                  setText(e.target.value);
                  setTypedName(null);
                }}
              />
            </Field>
          )}
          {snapshot && (
            <Field
              label={t('srp.settings.doctrines.dialog.nameLabel')}
              htmlFor={nameId}
              note={t('srp.settings.doctrines.dialog.preview', {
                hull: typeName(snapshot.hullTypeId),
                modules: snapshot.modules.length,
                rigs: snapshot.rigs.length,
              })}
            >
              <TextInput
                id={nameId}
                className="w-full max-w-md"
                value={name}
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setTypedName(e.target.value)}
              />
            </Field>
          )}
        </Fields>
        {unresolved.length > 0 && (
          <div className="grid gap-1 text-sm" role="status">
            <p className="font-semibold text-warning">
              {t('srp.settings.doctrines.dialog.unresolvedTitle', { count: unresolved.length })}
            </p>
            <p className="text-xs text-text-dim">
              {t('srp.settings.doctrines.dialog.unresolvedNote')}
            </p>
            <ul className="grid gap-0.5 font-mono text-xs">
              {unresolved.map((w, i) => (
                <li key={`${w.line ?? i}-${w.text}`}>
                  {t('srp.settings.doctrines.dialog.unresolvedLine', {
                    line: w.line ?? i + 1,
                    text: w.text,
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {parsed.failed && source === 'fitting' && (
          <p role="alert" className="text-sm text-danger">
            {t('srp.settings.doctrines.dialog.loadFailed')}
          </p>
        )}
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t('srp.settings.doctrines.dialog.addFailed')}
          </p>
        )}
      </div>
    </Modal>
  );
}
