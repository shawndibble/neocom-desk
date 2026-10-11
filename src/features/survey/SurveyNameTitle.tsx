/**
 * The Survey card's title on the Mining › Survey tab: the pilot's own name for
 * the Survey, or "Mining Survey" while it has none. A Survey in the pilot's
 * recents can be renamed in place (a faint pencil after the title, the whole
 * title the tap target); one that isn't shows the plain title. The name lives
 * in the pilot's recents (`surveyHistory`), never on the Survey.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { SURVEY_NAME_MAX } from '@/engine/survey/history';
import { cx } from '@/lib/cx';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { renameSurvey, useSurveyHistory } from './surveyHistory';

const editableTitleClassName = cx(
  'relative -mx-1 inline-flex max-w-full min-w-0 items-center gap-1 rounded-xs border border-transparent px-1 tracking-widest uppercase hover:border-line-bright hover:bg-panel-2 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[""]',
  interactiveClassName,
  focusRingClassName
);

export function SurveyNameTitle({ id }: { id: string }) {
  const { t } = useTranslation();
  const entry = useSurveyHistory((state) => state.value.find((e) => e.id === id));
  const [editing, setEditing] = useState(false);
  // Set once Enter or Esc has settled the field, so the blur that follows does not save again.
  const settled = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const fallback = t('survey.title');

  if (entry === undefined) return fallback;

  function close(save: string | null, refocus: boolean) {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    if (save !== null && save.trim() !== (entry?.name ?? '')) void renameSurvey(id, save);
    if (refocus) focusAfterCommit(button);
  }

  if (editing) {
    return (
      <TextInput
        size="sm"
        autoFocus
        defaultValue={entry.name ?? ''}
        maxLength={SURVEY_NAME_MAX}
        placeholder={fallback}
        aria-label={t('survey.nameLabel')}
        className="w-56 max-w-full tracking-normal normal-case"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            close(event.currentTarget.value, true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(null, true);
          }
        }}
        onBlur={(event) => close(event.currentTarget.value, false)}
      />
    );
  }

  const named = entry.name !== undefined;
  return (
    <button
      ref={button}
      type="button"
      aria-label={t('survey.nameEdit', { name: entry.name ?? fallback })}
      onClick={() => {
        settled.current = false;
        setEditing(true);
      }}
      className={cx(editableTitleClassName, named ? 'text-accent' : 'text-text-dim')}
    >
      <span className="min-w-0 truncate">{entry.name ?? fallback}</span>
      <Icon.Rename
        size={Icon.ICON_SIZE.sm}
        aria-hidden="true"
        className="shrink-0 text-text-faint"
      />
    </button>
  );
}
