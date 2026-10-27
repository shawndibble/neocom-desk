/**
 * The pilot's own note on one solar system, on a Route Safety row.
 *
 * Two faces of one popover editor: `indicator` is the icon beside the system
 * name when a note exists (tooltip = first line, tap/click opens it, so touch
 * works with no hover), `add` is the row action when it does not. Saved on
 * blur; empty text deletes. The text is a plain string rendered as text, never
 * markup, and is shown with its "updated" date so a stale "camp at 23:00"
 * reads as the pilot's own past observation beside live kill data.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
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

  // Saved on blur, and again when the popover goes away (Escape, an outside
  // click), where React fires no blur. A save of unchanged text is a no-op.
  const draftRef = useRef(draft);
  const save = useCallback(() => {
    const store = useSystemNotes.getState();
    const next = withSystemNote(store.value, systemId, draftRef.current, Date.now());
    if (next !== store.value) void store.setValue(next);
  }, [systemId]);
  useEffect(() => save, [save]);

  return (
    <div className="w-72 max-w-full space-y-1.5">
      <label htmlFor={fieldId} className="block text-[0.8125rem] font-semibold">
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
        className="text-[0.8125rem]"
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

export function SystemNote({
  systemId,
  name,
  face,
}: {
  systemId: number;
  name: string;
  face: 'indicator' | 'add';
}) {
  const { t } = useTranslation();
  const note = useSystemNotes((s) => s.value[systemId]);
  const [open, setOpen] = useState(false);

  if (face === 'indicator' ? note === undefined : note !== undefined) return null;

  const trigger =
    face === 'indicator' ? (
      <Tooltip content={noteFirstLine(note?.text ?? '')}>
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
    ) : (
      <PopoverTrigger asChild>
        <Button size="sm" aria-label={t('travel.note.addLabel', { name })}>
          {t('travel.note.add')}
        </Button>
      </PopoverTrigger>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger}
      <PopoverContent align="start" aria-label={t('travel.note.label', { name })}>
        <NoteEditor systemId={systemId} name={name} />
      </PopoverContent>
    </Popover>
  );
}
