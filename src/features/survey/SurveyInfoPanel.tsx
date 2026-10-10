/**
 * The Survey's "Additional information" panel, under Field progress: where the
 * fleet is mining (a system, station or structure, with a Set waypoint button),
 * the moon tax when the scans show a moon ore, and the starter's notes.
 *
 * The pilot who started the Survey edits it (`SurveyInfoEditor`). A pick
 * stores the location at once; the notes store when the box loses focus, never
 * per keystroke, since every store is a new doc. Everyone else, in the app or on
 * the public page, gets `SurveyInfoReadout`: the same rows read-only, and the
 * whole panel is left out when the starter set none of them. Both start blank
 * for each survey; only what the survey itself stored comes back.
 *
 * Notes are plain text on purpose (`whitespace-pre-line`, never markup): anyone
 * holding the link reads them.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, TextArea } from '@/components/ui';
import { InfoRow } from './InfoRow';
import { MoonTaxReadout, MoonTaxRow, type TaxSurvey } from './MoonTaxRow';
import { SurveyLocationPicker } from './SurveyLocationPicker';
import { SurveyWaypointButton } from './SurveyWaypointButton';
import {
  MAX_SURVEY_NOTES,
  setSurveyInfo,
  type SurveyInfoShare,
  type SurveyTaxShare,
} from './surveyStore';

type Location = NonNullable<SurveyInfoShare['location']>;

/** The stored survey this panel publishes to, with what is already stored there. */
export interface InfoSurvey extends TaxSurvey {
  info: SurveyInfoShare | null;
}

export function SurveyInfoEditor({
  characterId,
  survey,
  moon,
}: {
  characterId: number;
  survey?: InfoSurvey;
  /** The scans show a moon ore, so the moon tax row applies. */
  moon: boolean;
}) {
  const { t } = useTranslation();
  const [location, setLocation] = useState<Location | null>(survey?.info?.location ?? null);
  const [notes, setNotes] = useState(survey?.info?.notes ?? '');
  // What was last stored, so a blur with nothing new (or a retry after a failed
  // write) doesn't add a doc.
  const sent = useRef(JSON.stringify([survey?.info?.location ?? null, survey?.info?.notes ?? '']));

  function store(nextLocation: Location | null, nextNotes: string) {
    if (survey === undefined) return;
    const trimmed = nextNotes.trim();
    const key = JSON.stringify([nextLocation, trimmed]);
    if (sent.current === key) return;
    const before = sent.current;
    sent.current = key;
    void setSurveyInfo({
      id: survey.id,
      expiresAt: survey.expiresAt,
      location: nextLocation,
      notes: trimmed,
    }).catch(() => {
      // Best effort, like the moon tax: allow the next blur or pick to try again.
      if (sent.current === key) sent.current = before;
    });
  }

  return (
    <Panel title={t('survey.info.title')}>
      <div className="flex flex-col gap-4">
        <InfoRow label={t('survey.info.location')}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SurveyLocationPicker
              value={location}
              characterId={characterId}
              onPick={(place) => {
                const next = place === null ? null : { id: place.id, name: place.name };
                setLocation(next);
                store(next, notes);
              }}
            />
            {location !== null && <SurveyWaypointButton location={location} />}
          </div>
        </InfoRow>
        {moon && <MoonTaxRow characterId={characterId} survey={survey} />}
        <InfoRow label={t('survey.info.notes')}>
          <TextArea
            rows={3}
            maxLength={MAX_SURVEY_NOTES}
            aria-label={t('survey.info.notes')}
            placeholder={t('survey.info.notesPlaceholder')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => store(location, notes)}
          />
        </InfoRow>
      </div>
    </Panel>
  );
}

export function SurveyInfoReadout({
  info,
  tax,
}: {
  info: SurveyInfoShare | null;
  /** Already empty when the scans show no moon ore. */
  tax: SurveyTaxShare | null;
}) {
  const { t } = useTranslation();
  const location = info?.location ?? null;
  const notes = info?.notes ?? '';
  if (location === null && notes === '' && tax === null) return null;
  return (
    <Panel title={t('survey.info.title')}>
      <div className="flex flex-col gap-4">
        {location !== null && (
          <InfoRow label={t('survey.info.location')}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
                {location.name}
              </p>
              <SurveyWaypointButton location={location} />
            </div>
          </InfoRow>
        )}
        {tax !== null && <MoonTaxReadout tax={tax} />}
        {notes !== '' && (
          <InfoRow label={t('survey.info.notes')}>
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{notes}</p>
          </InfoRow>
        )}
      </div>
    </Panel>
  );
}
