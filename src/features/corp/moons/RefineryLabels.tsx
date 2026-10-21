import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Panel, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { callableErrorText } from './feederErrorText';

/** The label's longest form; the server refuses anything longer. */
export const REFINERY_LABEL_MAX = 100;

const k = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;

export interface RefineryLabelEdit {
  /** The officer label set now, from either side; empty when there is none. */
  current: (structureId: number) => string;
  /** Saves it; null clears it. Rejects with the callable's refusal. */
  onSave: (structureId: number, label: string | null) => Promise<void>;
}

/** One refinery: its resolved label, edited in place behind the faint pencil (§6c). */
function RefineryRow({
  structureId,
  name,
  edit,
}: {
  structureId: number;
  name: string;
  edit?: RefineryLabelEdit;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  // Set once Enter or Esc has settled the field, so the blur that follows does not save again.
  const settled = useRef(false);
  const hintId = useId();
  const focusAfterCommit = useFocusAfterCommit();

  function start() {
    if (!edit) return;
    settled.current = false;
    setError(null);
    setDraft(edit.current(structureId));
    setEditing(true);
  }
  // Enter and Escape hand focus back to the pencil; blur does not, the officer is already moving on.
  function close(save: boolean, refocus: boolean) {
    if (settled.current || !edit) return;
    settled.current = true;
    setEditing(false);
    if (refocus) focusAfterCommit(pencilRef);
    const next = draft.trim();
    if (!save || next === edit.current(structureId).trim()) return;
    edit
      .onSave(structureId, next === '' ? null : next)
      .catch((e: unknown) => setError(callableErrorText(t, e, k('failed'))));
  }

  return (
    <li className="space-y-1 px-3 py-2">
      {editing ? (
        <TextInput
          size="sm"
          autoFocus
          value={draft}
          maxLength={REFINERY_LABEL_MAX}
          placeholder={name}
          aria-label={t(k('field'))}
          aria-describedby={hintId}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => close(true, false)}
          onKeyDown={(e) => {
            // An Enter that confirms an IME candidate is not a save.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              close(true, true);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(false, true);
            }
          }}
          className="w-full max-w-md"
        />
      ) : (
        <span className="flex min-w-0 items-center gap-1 text-sm">
          <span className="[overflow-wrap:anywhere]">{name}</span>
          {edit && (
            <IconButton
              ref={pencilRef}
              size="row"
              variant="plain"
              icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
              label={t(k('edit'), { name })}
              tooltip={t(k('editTooltip'))}
              onClick={start}
            />
          )}
        </span>
      )}
      {editing && (
        <p id={hintId} className="text-xs text-text-dim">
          {t(k('hint'))}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * A moon owner's refineries, one row each, by the label chain. Either side's
 * officers can label one (`edit`); both corporations see it, the last edit wins.
 */
export function RefineryLabels({
  structureIds,
  name,
  edit,
}: {
  structureIds: readonly number[];
  /** The resolved label: the officer label, else the structure, system or owner fallback. */
  name: (structureId: number) => string;
  edit?: RefineryLabelEdit;
}) {
  const { t } = useTranslation();
  if (structureIds.length === 0) return null;
  const sorted = [...structureIds].sort((a, b) => name(a).localeCompare(name(b)) || a - b);
  return (
    <Panel title={t(k('title'))} padded={false}>
      <ul className="divide-y divide-line">
        {sorted.map((id) => (
          <RefineryRow key={id} structureId={id} name={name(id)} {...(edit ? { edit } : {})} />
        ))}
      </ul>
    </Panel>
  );
}
