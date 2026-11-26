import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { MenuItem } from '@/components/ui/RowActions';
import { TextArea } from '@/components/ui/TextArea';
import { Tooltip } from '@/components/ui/Tooltip';
import * as Icon from '@/components/ui/icons';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  SYSTEM_NOTE_MAX_LENGTH,
  noteFirstLine,
  useSystemNotes,
  withSystemNote,
} from './systemNotes';

function NoteEditor({ systemId, name }: { systemId: number; name: string }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const fieldId = useId();
  const note = useSystemNotes((s) => s.value[systemId]);
  const [draft, setDraft] = useState(note?.text ?? '');

  const draftRef = useRef(draft);
  const save = useCallback(() => {
    const store = useSystemNotes.getState();
    const next = withSystemNote(store.value, systemId, draftRef.current, Date.now());
    if (next !== store.value) void store.setValue(next);
  }, [systemId]);
  useEffect(() => save, [save]);

  return (
    <div className="w-72 max-w-full space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-semibold">
        {t('travel.note.label', { name })}
      </label>
      <TextArea
        id={fieldId}
        autoFocus
        rows={4}
        maxLength={SYSTEM_NOTE_MAX_LENGTH}
        placeholder={t('travel.note.placeholder')}
        value={draft}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
        }}
        onBlur={save}
        className="text-sm"
      />
      <p className="flex justify-between gap-2 text-[0.75rem] text-text-dim tabular-nums">
        <span>
          {note
            ? t('travel.note.updated', { date: formatDateOnly(new Date(note.updatedAt), timeZone) })
            : ''}
        </span>
        <span>{t('travel.note.count', { length: draft.length, max: SYSTEM_NOTE_MAX_LENGTH })}</span>
      </p>
    </div>
  );
}

export function SystemNote({ systemId, name }: { systemId: number; name: string }) {
  const { t } = useTranslation();
  const note = useSystemNotes((s) => s.value[systemId]);
  const [open, setOpen] = useState(false);
  if (note === undefined) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={noteFirstLine(note.text)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('travel.note.openLabel', { name })}
            className="inline-flex items-center text-accent"
          >
            <Icon.SystemNote aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" aria-label={t('travel.note.label', { name })}>
        <NoteEditor systemId={systemId} name={name} />
      </PopoverContent>
    </Popover>
  );
}

export function SystemNoteAnchor({
  systemId,
  name,
  open,
  onOpenChange,
  children,
}: {
  systemId: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef(onOpenChange);
  useEffect(() => {
    closeRef.current = onOpenChange;
  });
  useEffect(() => (open ? () => closeRef.current(false) : undefined), [open]);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span ref={anchorRef} className="inline-flex">
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        aria-label={t('travel.note.label', { name })}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          anchorRef.current?.querySelector('button')?.focus();
        }}
      >
        <NoteEditor systemId={systemId} name={name} />
      </PopoverContent>
    </Popover>
  );
}

export function SystemNoteMenuItem({
  systemId,
  onSelect,
}: {
  systemId: number;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const exists = useSystemNotes((s) => s.value[systemId] !== undefined);
  return (
    <MenuItem onSelect={onSelect}>{t(exists ? 'travel.note.edit' : 'travel.note.add')}</MenuItem>
  );
}
