import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import { loadSurvey } from '@/features/survey/surveyStore';
import { useCurrentSurveyId } from '@/features/survey/surveyPref';
import { DialogShell, Effect, Label } from './BookDialogs';
import { keptSurveyScan, loadMoonOreTypeIdByName } from './keptSurveyScan';
import { refusal } from './feederErrorText';
import { parseSurveyRef } from './surveyRef';
import { useBook } from './useBook';

/**
 * Link a Moon Ore Survey as a chunk's ore source (D13) when no moon drill
 * notification gave one. The Survey is read first, so a link that opens nothing
 * is refused here instead of silently leaving the ore unknown, and its first
 * scan is kept with the link.
 */
export function LinkSurveyDialog({
  open,
  onClose,
  extractionId,
}: {
  open: boolean;
  onClose: () => void;
  extractionId: string;
}) {
  const { t } = useTranslation();
  const { edit } = useBook();
  const current = useCurrentSurveyId((s) => s.value);
  const [text, setText] = useState(current ?? '');
  const id = parseSurveyRef(text);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.moon.link.title')}
      confirmLabel={t('corpTaxBook.moons.moon.link.confirm')}
      canConfirm={id !== null}
      run={async () => {
        const survey = await loadSurvey(id!);
        if (!survey.ok) throw refusal('survey-not-found');
        // Its first scan is kept with the link, so the make-up outlives the Survey's 7-day link.
        const surveyScan = keptSurveyScan(survey, await loadMoonOreTypeIdByName());
        await edit({
          action: 'linkSurvey',
          extractionId,
          surveyId: id,
          ...(surveyScan ? { surveyScan } : {}),
        });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.moon.link.intro')}</p>
      <Label text={t('corpTaxBook.moons.moon.link.field')}>
        <TextInput value={text} onChange={(e) => setText(e.target.value)} />
      </Label>
      <Effect>{t('corpTaxBook.moons.moon.link.effect')}</Effect>
    </DialogShell>
  );
}
