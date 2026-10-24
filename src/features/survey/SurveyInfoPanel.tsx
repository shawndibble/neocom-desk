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
 * The editor's box is plain text; readers get the notes as a small, safe slice
 * of Markdown (`SurveyNotes`), since anyone holding the link reads them.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, TextArea } from '@/components/ui';
import { InfoRow } from './InfoRow';
import { SurveyNotes } from './SurveyNotes';
import {
  applyTemplate,
  heldInclude,
  isEdited,
  templateFields,
  type InfoFields,
  type InfoTemplate,
} from '@/engine/survey/infoTemplate';
import { MoonTaxReadout, MoonTaxRow, type TaxSurvey } from './MoonTaxRow';
import type { ConnectableSurvey } from './useSurveyConnection';
import { initialTaxDraft, parseTaxPct } from './moonTaxPayee';
import { ManageTemplatesDialog, SaveTemplateDialog } from './SurveyTemplateDialogs';
import { SurveyTemplateMenu } from './SurveyTemplateMenu';
import { saveSurveyTemplate, useSurveyTemplates } from './surveyTemplates';
import { SurveyLocationPicker } from './SurveyLocationPicker';
import { SurveyWaypointButton } from './SurveyWaypointButton';
import {
  MAX_SURVEY_NOTES,
  setSurveyInfo,
  type SurveyInfoShare,
  type SurveyTaxShare,
} from './surveyStore';
import { useHydratedStore } from '@/lib/useHydratedStore';

type Location = NonNullable<SurveyInfoShare['location']>;

/** The stored survey this panel publishes to, with what is already stored there. */
export interface InfoSurvey extends TaxSurvey {
  info: SurveyInfoShare | null;
}

/** What Assign Taxes connects, less the location (each panel knows its own). */
export type SurveyToConnect = Omit<ConnectableSurvey, 'locationId' | 'locationName'>;

export function SurveyInfoEditor({
  characterId,
  survey,
  connect,
  moon,
  onStored,
}: {
  characterId: number;
  survey?: InfoSurvey;
  connect?: SurveyToConnect;
  /** The scans show a moon ore, so the moon tax row applies. */
  moon: boolean;
  /** A store landed: the page re-reads the survey so what it passes on (the chat message's location) is current. */
  onStored?: () => void;
}) {
  const { t } = useTranslation();
  const [location, setLocation] = useState<Location | null>(survey?.info?.location ?? null);
  const [notes, setNotes] = useState(survey?.info?.notes ?? '');
  const [tax, setTax] = useState(() => initialTaxDraft(survey?.published));
  const templates = useSurveyTemplates((state) => state.value);
  useHydratedStore(useSurveyTemplates);
  // The template last picked or saved here, for the strip that says so; it is not
  // remembered between visits, since each survey starts from what it stored.
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'save' | 'manage' | null>(null);
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
    })
      .then(onStored)
      .catch(() => {
        // Best effort, like the moon tax: allow the next blur or pick to try again.
        if (sent.current === key) sent.current = before;
      });
  }

  const taxPct = parseTaxPct(tax.pct);
  const fields: InfoFields = {
    location,
    tax: tax.name.trim() !== '' && taxPct !== null ? { name: tax.name.trim(), pct: taxPct } : null,
    notes,
  };
  const applied = templates.find((template) => template.id === appliedId);
  const edited = applied !== undefined && isEdited(applied, fields, { moon });

  function apply(template: InfoTemplate) {
    const next = applyTemplate(template, fields, { moon });
    setLocation(next.location);
    setNotes(next.notes);
    if (moon && template.tax) setTax({ name: template.tax.name, pct: String(template.tax.pct) });
    setAppliedId(template.id);
    // The tax goes up on its own once the row settles, as when it is typed.
    store(next.location, next.notes);
  }

  function updateApplied(template: InfoTemplate) {
    void saveSurveyTemplate({
      id: template.id,
      name: template.name,
      fields: templateFields(fields, heldInclude(template, { moon })),
    }).catch(() => undefined);
  }

  return (
    <Panel
      title={t('survey.info.title')}
      actions={
        <SurveyTemplateMenu
          templates={templates}
          appliedId={applied?.id ?? null}
          onApply={apply}
          onSave={() => setDialog('save')}
          onManage={() => setDialog('manage')}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {applied !== undefined && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{t('survey.templates.applied', { name: applied.name })}</span>
            {edited && (
              <>
                <span className="text-text-dim">{t('survey.templates.edited')}</span>
                <Button size="sm" onClick={() => updateApplied(applied)}>
                  {t('survey.templates.update')}
                </Button>
                <Button size="sm" onClick={() => setDialog('save')}>
                  {t('survey.templates.saveAsNew')}
                </Button>
              </>
            )}
          </p>
        )}
        <InfoRow label={t('survey.info.location')}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <SurveyLocationPicker
              value={location}
              characterId={characterId}
              onPick={(place) => {
                const next = place === null ? null : { id: place.id, name: place.name };
                setLocation(next);
                store(next, notes);
              }}
            />
            {location?.id != null && (
              <SurveyWaypointButton location={{ id: location.id, name: location.name }} />
            )}
          </div>
        </InfoRow>
        {moon && (
          <MoonTaxRow
            characterId={characterId}
            survey={survey}
            connectable={
              connect && {
                ...connect,
                locationId: location?.id ?? null,
                locationName: location?.name,
              }
            }
            draft={tax}
            onDraftChange={setTax}
          />
        )}
        <InfoRow label={t('survey.info.notesEditor')}>
          <TextArea
            rows={3}
            maxLength={MAX_SURVEY_NOTES}
            aria-label={t('survey.info.notesEditor')}
            placeholder={t('survey.info.notesPlaceholder')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => store(location, notes)}
          />
        </InfoRow>
      </div>
      {dialog === 'save' && (
        <SaveTemplateDialog
          fields={fields}
          moon={moon}
          templates={templates}
          onClose={() => setDialog(null)}
          onSaved={setAppliedId}
        />
      )}
      {dialog === 'manage' && (
        <ManageTemplatesDialog
          fields={fields}
          moon={moon}
          templates={templates}
          onClose={() => setDialog(null)}
        />
      )}
    </Panel>
  );
}

export function SurveyInfoReadout({
  info,
  tax,
  connect,
}: {
  info: SurveyInfoShare | null;
  /** Already empty when the scans show no moon ore. */
  tax: SurveyTaxShare | null;
  connect?: SurveyToConnect;
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
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <p className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
                {location.name}
              </p>
              {location.id !== null && (
                <SurveyWaypointButton location={{ id: location.id, name: location.name }} />
              )}
            </div>
          </InfoRow>
        )}
        {tax !== null && (
          <MoonTaxReadout
            tax={tax}
            connectable={
              connect && {
                ...connect,
                locationId: location?.id ?? null,
                locationName: location?.name,
              }
            }
          />
        )}
        {notes !== '' && (
          <InfoRow label={t('survey.info.notes')}>
            <SurveyNotes notes={notes} />
          </InfoRow>
        )}
      </div>
    </Panel>
  );
}
