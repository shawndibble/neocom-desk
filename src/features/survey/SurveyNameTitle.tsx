/**
 * The Survey card's title on the Mining › Survey tab: the pilot's own name for
 * the Survey, or "Mining Survey" while it has none. A Survey in the pilot's
 * recents can be renamed in place (a faint pencil after the title, the whole
 * title the tap target); one that isn't shows the plain title. The name lives
 * in the pilot's recents (`surveyHistory`), never on the Survey.
 */
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { SURVEY_NAME_MAX } from '@/engine/survey/history';
import { cx } from '@/lib/cx';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { renameSurvey, useSurveyHistory } from './surveyHistory';

const editableTitleClassName = cx(
  'relative flex w-full min-w-0 items-center gap-1 rounded-xs border border-transparent px-1 tracking-widest uppercase hover:border-line-bright hover:bg-panel-2 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[""]',
  interactiveClassName,
  focusRingClassName
);

export function SurveyNameTitle({ id }: { id: string }) {
  const { t } = useTranslation();
  const entry = useSurveyHistory((state) => state.value.find((e) => e.id === id));
  const fallback = t('survey.title');
  const { editing, start, triggerRef, inputProps } = useInPlaceEdit({
    initial: () => entry?.name ?? '',
    onCommit: (name) => {
      void renameSurvey(id, name);
    },
  });

  if (entry === undefined) return fallback;

  if (editing) {
    return (
      <TextInput
        size="sm"
        {...inputProps}
        maxLength={SURVEY_NAME_MAX}
        placeholder={fallback}
        aria-label={t('survey.nameLabel')}
        className="w-56 max-w-full tracking-normal normal-case"
      />
    );
  }

  const named = entry.name !== undefined;
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-label={t('survey.nameEdit', { name: entry.name ?? fallback })}
      onClick={start}
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
