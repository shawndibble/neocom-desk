/**
 * The three details a Survey can carry, as one form: where it is mined, who
 * collects the moon tax and at what rate, and the starter's notes. Shared by the
 * `/survey` page (which builds a start link from them) and the public result page
 * for the device that started the Survey (which stores them on it), so the two
 * look and behave alike. Controlled: the caller owns the values and what a change
 * does. Works with no Character: systems and NPC stations are searched from local
 * data, and the payee box falls back to the public name lookups.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Fields, TextArea, TextInput } from '@/components/ui';
import { PayeeNameField } from '@/features/miningTax/PayeeNameField';
import type { PayeeEntityMatch } from '@/features/miningTax/payeeEntitySearch';
import { SurveyLocationPicker } from './SurveyLocationPicker';
import type { SurveyPlace } from './surveyPlaces';
import { MAX_SURVEY_NOTES } from './surveyStore';

export function SurveyDetailsFields({
  place,
  payeeName,
  rateText,
  notes,
  characterId,
  placeNote,
  payeeNote,
  onPlace,
  onPayeeName,
  onPayeePick,
  onRate,
  onNotes,
  onCommit,
}: {
  place: { id: number | null; name: string } | null;
  payeeName: string;
  rateText: string;
  notes: string;
  /** Null with nobody logged in. */
  characterId: number | null;
  /** Replaces the default line under Location. */
  placeNote?: ReactNode;
  /** The line under the moon tax boxes. */
  payeeNote?: ReactNode;
  onPlace: (place: SurveyPlace | null) => void;
  onPayeeName: (name: string) => void;
  onPayeePick: (match: PayeeEntityMatch) => void;
  onRate: (text: string) => void;
  onNotes: (text: string) => void;
  /** Focus left the form: the moment to store what changed. A pick stores through its own callback. */
  onCommit?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onCommit?.();
      }}
    >
      <Fields variant="form">
        <Field
          label={t('survey.info.location')}
          note={placeNote ?? (characterId === null ? t('survey.start.structureNote') : undefined)}
        >
          <div className="flex w-full min-w-0">
            <SurveyLocationPicker value={place} characterId={characterId} onPick={onPlace} />
          </div>
        </Field>
        <Field label={t('survey.start.moonTax')} note={payeeNote}>
          <PayeeNameField
            id="survey-details-payee"
            size="sm"
            ariaLabel={t('survey.start.payee')}
            placeholder={t('survey.start.payeePlaceholder')}
            characterId={characterId}
            value={payeeName}
            onChange={onPayeeName}
            onPick={onPayeePick}
            className="min-w-0 flex-1 basis-56"
          />
          <TextInput
            size="sm"
            inputMode="decimal"
            aria-label={t('survey.start.rate')}
            placeholder={t('survey.start.ratePlaceholder')}
            value={rateText}
            onChange={(event) => onRate(event.target.value)}
            className="w-24"
          />
        </Field>
        <Field label={t('survey.info.notesEditor')}>
          <TextArea
            rows={3}
            maxLength={MAX_SURVEY_NOTES}
            aria-label={t('survey.info.notesEditor')}
            placeholder={t('survey.info.notesPlaceholder')}
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
          />
        </Field>
      </Fields>
    </div>
  );
}
