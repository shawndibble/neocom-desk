import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CollapsiblePanel, Fields, Panel, TextArea } from '@/components/ui';
import { useInfoFold } from './useInfoFold';
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

export interface InfoSurvey extends TaxSurvey {
  info: SurveyInfoShare | null;
}

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
  moon: boolean;
  onStored?: () => void;
}) {
  const { t } = useTranslation();
  const [location, setLocation] = useState<Location | null>(survey?.info?.location ?? null);
  const [notes, setNotes] = useState(survey?.info?.notes ?? '');
  const [tax, setTax] = useState(() => initialTaxDraft(survey?.published));
  const templates = useSurveyTemplates((state) => state.value);
  useHydratedStore(useSurveyTemplates);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'save' | 'manage' | null>(null);
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
      characterId,
    })
      .then(onStored)
      .catch(() => {
        if (sent.current === key) sent.current = before;
      });
  }

  const fold = useInfoFold(survey?.id, { info: survey?.info, tax: survey?.published });
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
    fold.open();
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
    <>
      <CollapsiblePanel
        title={t('survey.info.title')}
        expanded={fold.expanded}
        onToggle={fold.onToggle}
        labels={{ show: t('survey.info.show'), hide: t('survey.info.hide') }}
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
        {applied !== undefined && (
          <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
        <Fields variant="form">
          <InfoRow label={t('survey.info.location')}>
            <div className="flex min-w-0 flex-1 basis-64">
              <SurveyLocationPicker
                value={location}
                characterId={characterId}
                onPick={(place) => {
                  const next = place === null ? null : { id: place.id, name: place.name };
                  setLocation(next);
                  store(next, notes);
                }}
              />
            </div>
            {location?.id != null && (
              <SurveyWaypointButton location={{ id: location.id, name: location.name }} />
            )}
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
        </Fields>
      </CollapsiblePanel>
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
    </>
  );
}

export function SurveyInfoReadout({
  info,
  tax,
  connect,
}: {
  info: SurveyInfoShare | null;
  tax: SurveyTaxShare | null;
  connect?: SurveyToConnect;
}) {
  const { t } = useTranslation();
  const location = info?.location ?? null;
  const notes = info?.notes ?? '';
  if (location === null && notes === '' && tax === null) return null;
  return (
    <Panel title={t('survey.info.title')}>
      <Fields variant="form">
        {location !== null && (
          <InfoRow label={t('survey.info.location')}>
            <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{location.name}</p>
            {location.id !== null && (
              <SurveyWaypointButton location={{ id: location.id, name: location.name }} />
            )}
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
      </Fields>
    </Panel>
  );
}
