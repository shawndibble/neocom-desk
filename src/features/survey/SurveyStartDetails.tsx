/**
 * The empty Survey page's "Additional information": where the field is, who gets
 * the moon tax and at what rate, and notes, filled in before the first scan so the
 * Survey the scan starts carries them. A saved template fills these boxes too; they
 * stay editable. Held by the page (`SurveyTab`) as a `StartDraft` (`startDraft.ts`).
 */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { SurveyDetailsFields } from './SurveyDetailsFields';
import type { StartDraft } from './startDraft';

export function SurveyStartDetails({
  characterId,
  draft,
  onChange,
}: {
  characterId: number;
  draft: StartDraft;
  onChange: (draft: StartDraft) => void;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={t('survey.info.title')}>
      <SurveyDetailsFields
        place={draft.place}
        payeeName={draft.payeeName}
        rateText={draft.rateText}
        notes={draft.notes}
        characterId={characterId}
        placeNote={t('survey.start.inAppNote')}
        onPlace={(picked) =>
          onChange({
            ...draft,
            place: picked === null ? null : { id: picked.id, name: picked.name },
          })
        }
        onPayeeName={(payeeName) => onChange({ ...draft, payeeName })}
        onPayeePick={(match) => onChange({ ...draft, payeeName: match.name })}
        onRate={(rateText) => onChange({ ...draft, rateText })}
        onNotes={(notes) => onChange({ ...draft, notes })}
      />
    </Panel>
  );
}
