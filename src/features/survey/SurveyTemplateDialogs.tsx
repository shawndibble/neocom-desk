/**
 * The two dialogs behind the Templates menu: "Save as template" (a name and
 * which of the panel's fields to keep) and the list of templates, where each one
 * can be renamed, updated from the panel as it is now, or deleted (with Undo).
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Modal, TextInput, Toast } from '@/components/ui';
import {
  findTemplateByName,
  heldInclude,
  templateFields,
  TEMPLATE_NAME_MAX,
  type InfoFields,
  type InfoInclude,
  type InfoTemplate,
} from '@/engine/survey/infoTemplate';
import {
  deleteSurveyTemplate,
  renameSurveyTemplate,
  restoreSurveyTemplate,
  saveSurveyTemplate,
} from './surveyTemplates';
import { useTemplateSummary } from './surveyTemplateText';

interface CurrentFields {
  fields: InfoFields;
  /** The Survey shows a moon ore, so the moon tax is on the panel. */
  moon: boolean;
}

interface SaveDialogProps extends CurrentFields {
  templates: readonly InfoTemplate[];
  onClose: () => void;
  /** The saved template's id, so the panel can track it. */
  onSaved: (id: string) => void;
}

export function SaveTemplateDialog({ fields, moon, templates, onClose, onSaved }: SaveDialogProps) {
  const { t } = useTranslation();
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const available: InfoInclude = {
    location: fields.location !== null,
    tax: moon && fields.tax !== null,
    notes: fields.notes.trim() !== '',
  };
  const [include, setInclude] = useState<InfoInclude>(available);
  const [saving, setSaving] = useState(false);
  const replacing = findTemplateByName(templates, name) !== undefined;
  const anything = include.location || include.tax || include.notes;
  const ready = name.trim() !== '' && anything && !saving;

  async function save() {
    setSaving(true);
    const id = await saveSurveyTemplate({ name, fields: templateFields(fields, include) }).catch(
      () => null
    );
    setSaving(false);
    if (id !== null) onSaved(id);
    onClose();
  }

  const rows: { key: keyof InfoInclude; label: string; value: string | null }[] = [
    { key: 'location', label: t('survey.info.location'), value: fields.location?.name ?? null },
    {
      key: 'tax',
      label: t('survey.moonTax.label'),
      value:
        moon && fields.tax
          ? t('survey.templates.summaryTax', { pct: fields.tax.pct, name: fields.tax.name })
          : null,
    },
    {
      key: 'notes',
      label: t('survey.info.notes'),
      value: fields.notes.trim().split('\n')[0] ?? null,
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={t('survey.templates.saveTitle')}
      initialFocusRef={nameField}
    >
      <form
        className="space-y-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-dim">{t('survey.templates.name')}</span>
          <TextInput
            ref={nameField}
            value={name}
            maxLength={TEMPLATE_NAME_MAX}
            placeholder={t('survey.templates.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-text-dim">{t('survey.templates.include')}</legend>
          {rows.map((row) => (
            <label key={row.key} className="flex min-h-9 items-center gap-2">
              <Checkbox
                checked={include[row.key]}
                disabled={!available[row.key]}
                onChange={(event) => setInclude({ ...include, [row.key]: event.target.checked })}
              />
              <span>{row.label}</span>
              <span className="ml-auto max-w-[60%] min-w-0 truncate text-text-dim">
                {row.value}
              </span>
            </label>
          ))}
        </fieldset>
        {replacing && <p className="text-xs text-text-dim">{t('survey.templates.replaceHint')}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" size="sm" disabled={!ready}>
            {replacing ? t('survey.templates.replace') : t('survey.templates.save')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface ManageDialogProps extends CurrentFields {
  templates: readonly InfoTemplate[];
  onClose: () => void;
}

type Notice = { message: string; undo?: { label: string; onUndo: () => void } };

export function ManageTemplatesDialog({ templates, fields, moon, onClose }: ManageDialogProps) {
  const { t } = useTranslation();
  const summary = useTemplateSummary();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function rename() {
    if (renaming === null) return;
    await renameSurveyTemplate(renaming.id, renaming.name).catch(() => undefined);
    setRenaming(null);
  }

  async function update(template: InfoTemplate) {
    const next = templateFields(fields, heldInclude(template, { moon }));
    if (Object.keys(next).length === 0) return;
    await saveSurveyTemplate({ id: template.id, name: template.name, fields: next }).catch(
      () => undefined
    );
    setNotice({ message: t('survey.templates.updated', { name: template.name }) });
  }

  async function remove(template: InfoTemplate, index: number) {
    await deleteSurveyTemplate(template.id).catch(() => undefined);
    setNotice({
      message: t('survey.templates.deleted', { name: template.name }),
      undo: {
        label: t('survey.templates.undo'),
        onUndo: () => void restoreSurveyTemplate(template, index).catch(() => undefined),
      },
    });
  }

  return (
    <Modal open onClose={onClose} title={t('survey.templates.manageTitle')}>
      <div className="space-y-3 text-sm">
        {templates.length === 0 ? (
          <p className="text-text-dim">{t('survey.templates.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
            {templates.map((template, index) => (
              <li key={template.id} className="flex flex-col gap-1 px-2 py-2">
                {renaming?.id === template.id ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                  >
                    <TextInput
                      size="sm"
                      autoFocus
                      aria-label={t('survey.templates.renameLabel')}
                      maxLength={TEMPLATE_NAME_MAX}
                      value={renaming.name}
                      onChange={(event) =>
                        setRenaming({ id: template.id, name: event.target.value })
                      }
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={renaming.name.trim() === ''}
                    >
                      {t('common.save')}
                    </Button>
                    <Button size="sm" onClick={() => setRenaming(null)}>
                      {t('common.cancel')}
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 truncate font-semibold">{template.name}</span>
                    <span className="min-w-0 truncate text-xs text-text-dim">
                      {summary(template)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => setRenaming({ id: template.id, name: template.name })}
                      >
                        {t('survey.templates.rename')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          Object.keys(templateFields(fields, heldInclude(template, { moon })))
                            .length === 0
                        }
                        onClick={() => void update(template)}
                      >
                        {t('survey.templates.updateFromCurrent')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void remove(template, index)}
                      >
                        {t('survey.templates.delete')}
                      </Button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="pt-1">
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
      {notice !== null && (
        <Toast message={notice.message} undo={notice.undo} onClose={() => setNotice(null)} />
      )}
    </Modal>
  );
}
