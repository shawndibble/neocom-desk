/**
 * Vetting settings, for a Director, in four sections: General (on or off, what applicants
 * read), Applicants (minimums, questions, invite-only), Decisions (sign-offs, what a no tells
 * the pilot, the mail and the reviewers' notification) and the Watchlist.
 *
 * Sections follow the app's own Settings page: from `md` a rail of real links beside one section
 * (`/corp/vetting/settings/<section>`), and on a phone, which has no room for a second column,
 * every section in one page under its heading. Text, numbers and ticks are edits to one draft
 * that spans the sections, saved from the `UnsavedChangesBar` as SRP's settings are; turning
 * vetting on or off and the watchlist each save by themselves.
 */
import { useId, useRef, useState } from 'react';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  FieldError,
  Fields,
  IconButton,
  Panel,
  SegmentedControl,
  TextArea,
  TextInput,
  Toast,
  UnsavedChangesBar,
  type DataTableColumn,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import * as Icon from '@/components/ui/icons';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import {
  VETTING_CONTACT_MAX,
  VETTING_MINIMUM_LIMITS,
  VETTING_QUESTION_MAX,
  VETTING_QUESTIONS_MAX,
  VETTING_WATCHLIST_MAX,
  VETTING_WELCOME_MAX,
  type VettingKind,
  type VettingMinimumId,
  type VettingRejection,
  type VettingSettings,
  type VettingWatchEntry,
} from '@/engine/vetting';
import {
  AttentionDot,
  sectionRailClassName,
  SectionRailLink,
} from '@/features/settings/sectionRail';
import { ActionResult, CheckboxField, SettingsHint } from '@/features/settings/settingsFields';
import { callableErrorReason } from '@/lib/callableError';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { VettingEntity } from './VettingEntity';
import type { VettingSettingsPatch } from './vettingBackend';
import {
  addQuestion,
  dirtySections,
  formFromSettings,
  formIsDirty,
  formProblems,
  formToPatch,
  moveQuestion,
  patchQuestion,
  removeQuestion,
  settleMinimum,
  VETTING_SETTINGS_SECTIONS,
  type VettingSettingsForm,
  type VettingSettingsSection,
} from './vettingSettingsForm';
import { settingsSectionPath } from './vettingTabs';
import { VETTING_MINIMUM_IDS, vettingErrorKey } from './vettingView';

const KINDS: readonly VettingKind[] = ['application', 'promotion'];
const SIGN_OFF_CHOICES = ['1', '2', '3'] as const;
const WORDINGS: readonly VettingRejection['wording'][] = ['rejected', 'notNow'];

/** "12 / 600" under a text field with a limit. */
function Counter({ used, max }: { used: number; max: number }) {
  const { t } = useTranslation();
  return (
    <span className="w-full text-right text-xs text-text-dim tabular-nums">
      {t('vetting.counter', { count: used, max })}
    </span>
  );
}

interface VettingSettingsViewProps {
  settings: VettingSettings;
  /** The section a path below Settings names. A phone shows them all. */
  section: VettingSettingsSection;
  /** Live invite links, for the count beside the button that opens them. */
  invites: number;
  /** Saves one change, or the draft; rejects with the server's refusal. */
  onSave: (patch: VettingSettingsPatch) => Promise<void>;
  /** Opens the invite links, which any reviewer manages from the queue. */
  onManageInvites: () => void;
}

export function VettingSettingsView({
  settings,
  section,
  invites,
  onSave,
  onManageInvites,
}: VettingSettingsViewProps) {
  const { t } = useTranslation();
  const uid = useId();
  const stacked = useIsNarrow();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  // The edits not yet saved; null while the form shows what is saved.
  const [draft, setDraft] = useState<VettingSettingsForm | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nextKey = useRef(0);
  // DESIGN.md §7: an action that removes its own control hands focus to the neighbouring row.
  const focusAfterCommit = useFocusAfterCommit();
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const control = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) controls.current.set(id, el);
    else controls.current.delete(id);
  };
  const at = (id: string | undefined) => () => (id === undefined ? null : controls.current.get(id));
  const addQuestionRef = useRef<HTMLButtonElement>(null);
  const watchHeadingRef = useRef<HTMLDivElement>(null);

  const form = draft ?? formFromSettings(settings);
  const edit = (next: VettingSettingsForm) => {
    setSaveFailed(null);
    setDraft(next);
  };
  const patch = (change: Partial<VettingSettingsForm>) => edit({ ...form, ...change });
  const problems = formProblems(form);
  const dirty = formIsDirty(form, settings);
  const edited = new Set(dirtySections(form, settings));

  /** One change that saves by itself: on or off, a watchlist entry. */
  const save = async (what: string, change: VettingSettingsPatch): Promise<boolean> => {
    if (busy !== null) return false;
    setBusy(what);
    setError(null);
    try {
      await onSave(change);
      return true;
    } catch (err) {
      setError(t(vettingErrorKey(callableErrorReason(err))));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (busy !== null || problems.count > 0) return;
    setBusy('draft');
    setSaveFailed(null);
    try {
      await onSave(formToPatch(form, settings));
      setDraft(null);
      setToast(t('vetting.settings.saved'));
    } catch (err) {
      setSaveFailed(t(vettingErrorKey(callableErrorReason(err))));
    } finally {
      setBusy(null);
    }
  };

  const columns: DataTableColumn<VettingWatchEntry>[] = [
    {
      id: 'name',
      header: t('vetting.settings.watchlist.name'),
      primary: true,
      render: (row) => (
        <VettingEntity id={row.id} category={row.category}>
          {row.name}
        </VettingEntity>
      ),
    },
    {
      id: 'category',
      header: t('vetting.settings.watchlist.kind'),
      render: (row) => t(`vetting.settings.watchlist.category.${row.category}`),
    },
    {
      id: 'remove',
      header: '',
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (
        <Button
          ref={control(`watch:${row.id}`)}
          size="sm"
          className="whitespace-nowrap"
          loading={busy === `remove:${row.id}`}
          aria-label={t('vetting.settings.watchlist.removeNamed', { name: row.name })}
          onClick={() => void removeWatch(row.id)}
        >
          {t('vetting.settings.watchlist.remove')}
        </Button>
      ),
    },
  ];

  /** Removes one entry; the row goes, so focus moves to the next, the one before, or the list's top. */
  const removeWatch = async (id: number) => {
    const index = settings.watchlist.findIndex((entry) => entry.id === id);
    const next = settings.watchlist[index + 1]?.id;
    const previous = settings.watchlist[index - 1]?.id;
    if (!(await save(`remove:${id}`, { removeWatch: [id] }))) return;
    focusAfterCommit(
      at(next === undefined ? undefined : `watch:${next}`),
      at(previous === undefined ? undefined : `watch:${previous}`),
      watchHeadingRef
    );
  };

  const full = settings.watchlist.length >= VETTING_WATCHLIST_MAX;
  const add = async () => {
    const wanted = name.trim();
    if (wanted === '' || full) return;
    if (await save('add', { addWatchNames: [wanted] })) setName('');
  };

  const minimumField = (id: VettingMinimumId) => {
    const fieldId = `${uid}-min-${id}`;
    const invalid = problems.minimums.includes(id);
    return (
      <Field
        key={id}
        label={t(`vetting.settings.minimums.${id}`)}
        htmlFor={fieldId}
        note={t('vetting.settings.minimums.upTo', {
          max: formatCount(VETTING_MINIMUM_LIMITS[id]),
        })}
      >
        <TextInput
          id={fieldId}
          inputMode="numeric"
          className={id === 'skillPoints' ? 'w-36' : 'w-24'}
          value={form.minimums[id]}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? `${fieldId}-err` : undefined}
          onChange={(event) => patch({ minimums: { ...form.minimums, [id]: event.target.value } })}
          onBlur={() => {
            const settled = settleMinimum(id, form.minimums[id]);
            if (settled !== form.minimums[id]) {
              patch({ minimums: { ...form.minimums, [id]: settled } });
            }
          }}
        />
        {id === 'ageDays' && (
          <span className="text-text-dim">{t('vetting.settings.minimums.ageDaysUnit')}</span>
        )}
        {invalid && (
          <FieldError id={`${fieldId}-err`} className="w-full">
            {t('vetting.settings.minimums.invalid')}
          </FieldError>
        )}
      </Field>
    );
  };

  const questionsFull = form.questions.length >= VETTING_QUESTIONS_MAX;

  const sections: Record<VettingSettingsSection, React.ReactNode> = {
    general: (
      <>
        <Panel
          title={t('vetting.settings.state.title')}
          meta={
            <Pill tone={settings.on ? 'success' : 'neutral'}>
              {t(settings.on ? 'vetting.settings.state.on' : 'vetting.settings.state.off')}
            </Pill>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-text-dim">
              {t(settings.on ? 'vetting.settings.state.onHint' : 'vetting.settings.state.offHint')}
            </p>
            <Button
              variant={settings.on ? 'ghost' : 'primary'}
              loading={busy === 'on'}
              onClick={() => void save('on', { on: !settings.on })}
            >
              {t(settings.on ? 'vetting.settings.state.turnOff' : 'vetting.settings.state.turnOn')}
            </Button>
          </div>
        </Panel>
        <Panel title={t('vetting.settings.text.title')}>
          <Fields variant="form">
            <Field
              label={t('vetting.settings.text.welcome')}
              htmlFor={`${uid}-welcome`}
              note={t('vetting.settings.text.welcomeNote')}
            >
              <TextArea
                id={`${uid}-welcome`}
                rows={4}
                className="w-full"
                maxLength={VETTING_WELCOME_MAX}
                value={form.welcome}
                onChange={(event) => patch({ welcome: event.target.value })}
              />
              <Counter used={form.welcome.length} max={VETTING_WELCOME_MAX} />
            </Field>
            <Field
              label={t('vetting.settings.text.contact')}
              htmlFor={`${uid}-contact`}
              note={t('vetting.settings.text.contactNote')}
            >
              <TextInput
                id={`${uid}-contact`}
                className="w-full"
                maxLength={VETTING_CONTACT_MAX}
                value={form.contact}
                onChange={(event) => patch({ contact: event.target.value })}
              />
              <Counter used={form.contact.length} max={VETTING_CONTACT_MAX} />
            </Field>
          </Fields>
        </Panel>
      </>
    ),
    applicants: (
      <>
        <Panel title={t('vetting.settings.minimums.title')}>
          <div className="grid gap-4">
            <SettingsHint>{t('vetting.settings.minimums.hint')}</SettingsHint>
            <Fields variant="form">{VETTING_MINIMUM_IDS.map(minimumField)}</Fields>
          </div>
        </Panel>
        <Panel
          title={t('vetting.settings.questions.title')}
          meta={t('vetting.settings.questions.meta', {
            count: form.questions.length,
            max: VETTING_QUESTIONS_MAX,
          })}
        >
          <div className="grid gap-3">
            <SettingsHint>{t('vetting.settings.questions.hint')}</SettingsHint>
            {form.questions.length === 0 ? (
              <EmptyState
                title={t('vetting.settings.questions.emptyTitle')}
                hint={t('vetting.settings.questions.emptyHint')}
              />
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {form.questions.map((question, index) => {
                  const n = index + 1;
                  const fieldId = `${uid}-q-${question.key}`;
                  const blank = problems.questions.includes(question.key);
                  return (
                    <li key={question.key} className="grid gap-2 py-2 sm:grid-cols-[1fr_auto]">
                      <div className="min-w-0 space-y-1">
                        <TextInput
                          id={fieldId}
                          className="w-full"
                          aria-label={t('vetting.settings.questions.question', { n })}
                          placeholder={t('vetting.settings.questions.question', { n })}
                          maxLength={VETTING_QUESTION_MAX}
                          value={question.label}
                          aria-invalid={blank ? true : undefined}
                          aria-describedby={blank ? `${fieldId}-err` : undefined}
                          onChange={(event) =>
                            edit(patchQuestion(form, question.key, { label: event.target.value }))
                          }
                        />
                        {blank && (
                          <FieldError id={`${fieldId}-err`}>
                            {t('vetting.settings.questions.blank')}
                          </FieldError>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <label className="mr-2 inline-flex items-center gap-2 text-sm">
                          <span className={touchCheckboxLabelClassName}>
                            <Checkbox
                              aria-label={t('vetting.settings.questions.requiredNamed', { n })}
                              checked={question.required}
                              onChange={(event) =>
                                edit(
                                  patchQuestion(form, question.key, {
                                    required: event.target.checked,
                                  })
                                )
                              }
                            />
                          </span>
                          <span aria-hidden="true">{t('vetting.settings.questions.required')}</span>
                        </label>
                        <span className="flex items-center gap-1">
                          {/* Inert at either end, never `disabled`: the button a move leaves at
                              the end keeps keyboard focus. */}
                          <IconButton
                            ref={control(`up:${question.key}`)}
                            icon={<Icon.Ascending size={Icon.ICON_SIZE.sm} />}
                            label={t('vetting.settings.questions.moveUp', { n })}
                            aria-disabled={index === 0 || undefined}
                            onClick={() => {
                              edit(moveQuestion(form, question.key, -1));
                              focusAfterCommit(at(`up:${question.key}`));
                            }}
                          />
                          <IconButton
                            ref={control(`down:${question.key}`)}
                            icon={<Icon.Descending size={Icon.ICON_SIZE.sm} />}
                            label={t('vetting.settings.questions.moveDown', { n })}
                            aria-disabled={index === form.questions.length - 1 || undefined}
                            onClick={() => {
                              edit(moveQuestion(form, question.key, 1));
                              focusAfterCommit(at(`down:${question.key}`));
                            }}
                          />
                          <IconButton
                            ref={control(`remove:${question.key}`)}
                            icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
                            label={t('vetting.settings.questions.remove', { n })}
                            onClick={() => {
                              edit(removeQuestion(form, question.key));
                              // The next question, else the one before, else Add question.
                              focusAfterCommit(
                                at(`remove:${form.questions[index + 1]?.key}`),
                                at(`remove:${form.questions[index - 1]?.key}`),
                                addQuestionRef
                              );
                            }}
                          />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                ref={addQuestionRef}
                className="max-sm:w-full"
                aria-disabled={questionsFull || undefined}
                onClick={
                  questionsFull
                    ? undefined
                    : () => {
                        nextKey.current += 1;
                        edit(addQuestion(form, `new-${nextKey.current}`));
                      }
                }
              >
                {t('vetting.settings.questions.add')}
              </Button>
              {questionsFull && (
                <span className="text-xs text-text-dim">
                  {t('vetting.settings.questions.full', { count: VETTING_QUESTIONS_MAX })}
                </span>
              )}
            </div>
          </div>
        </Panel>
        <Panel title={t('vetting.settings.invites.title')}>
          <Fields variant="form">
            <CheckboxField
              id={`${uid}-invite-only`}
              label={t('vetting.settings.invites.label')}
              hint={t('vetting.settings.invites.note')}
              checked={form.inviteOnly}
              onChange={() => patch({ inviteOnly: !form.inviteOnly })}
            />
            <Field label={t('vetting.settings.invites.manage')}>
              <Button className="max-sm:w-full" onClick={onManageInvites}>
                {t('vetting.settings.invites.open', { count: invites })}
              </Button>
            </Field>
          </Fields>
        </Panel>
      </>
    ),
    decisions: (
      <>
        <Panel title={t('vetting.settings.signOffs.title')}>
          <Fields variant="form">
            {KINDS.map((kind, index) => (
              <Field
                key={kind}
                label={t(`vetting.settings.signOffs.${kind}`)}
                note={index === KINDS.length - 1 ? t('vetting.settings.signOffs.hint') : undefined}
              >
                <SegmentedControl
                  label={t(`vetting.settings.signOffs.${kind}`)}
                  uppercase={false}
                  value={String(form.signOffs[kind]) as (typeof SIGN_OFF_CHOICES)[number]}
                  onChange={(value) =>
                    patch({ signOffs: { ...form.signOffs, [kind]: Number(value) } })
                  }
                  options={SIGN_OFF_CHOICES.map((value) => ({ value, label: value }))}
                />
              </Field>
            ))}
          </Fields>
        </Panel>
        <Panel title={t('vetting.settings.rejection.title')}>
          <Fields variant="form">
            <Field
              label={t('vetting.settings.rejection.wording')}
              note={t('vetting.settings.rejection.wordingNote')}
            >
              <SegmentedControl
                label={t('vetting.settings.rejection.wording')}
                uppercase={false}
                value={form.wording}
                onChange={(wording) => patch({ wording })}
                options={WORDINGS.map((value) => ({
                  value,
                  label: t(`vetting.rejection.${value}`),
                }))}
              />
            </Field>
            <CheckboxField
              id={`${uid}-show-reason`}
              label={t('vetting.settings.rejection.showReason')}
              hint={t('vetting.settings.rejection.showReasonNote')}
              checked={form.showReason}
              onChange={() => patch({ showReason: !form.showReason })}
            />
            <CheckboxField
              id={`${uid}-mail`}
              label={t('vetting.settings.rejection.mail')}
              hint={t('vetting.settings.rejection.mailNote')}
              checked={form.mailDecision}
              onChange={() => patch({ mailDecision: !form.mailDecision })}
            />
          </Fields>
        </Panel>
        <Panel title={t('vetting.settings.notify.title')}>
          <Fields variant="form">
            <CheckboxField
              id={`${uid}-notify`}
              label={t('vetting.settings.notify.label')}
              hint={t('vetting.settings.notify.note')}
              checked={form.notifyReviewers}
              onChange={() => patch({ notifyReviewers: !form.notifyReviewers })}
            />
          </Fields>
        </Panel>
      </>
    ),
    watchlist: (
      // Takes focus when the last entry is removed (it has no ring: it is not a control).
      <div ref={watchHeadingRef} className="focus:outline-none">
        <Panel
          title={t('vetting.settings.watchlist.title')}
          meta={t('vetting.settings.watchlist.count', { count: settings.watchlist.length })}
          padded={false}
        >
          {settings.watchlist.length === 0 ? (
            <EmptyState
              title={t('vetting.settings.watchlist.emptyTitle')}
              hint={t('vetting.settings.watchlist.emptyHint')}
            />
          ) : (
            <DataTable
              label={t('vetting.settings.watchlist.title')}
              columns={columns}
              rows={settings.watchlist}
              rowKey={(row) => row.id}
            />
          )}
          <form
            className="flex flex-wrap items-end gap-2 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <label className="block min-w-0 flex-1 space-y-1">
              <span className="text-xs text-text-dim">
                {t('vetting.settings.watchlist.addLabel')}
              </span>
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <Button
              type="submit"
              loading={busy === 'add'}
              aria-disabled={name.trim() === '' || full || undefined}
            >
              {t('vetting.settings.watchlist.add')}
            </Button>
            {full && (
              <p className="w-full text-xs text-text-dim">
                {t('vetting.settings.watchlist.full', { count: VETTING_WATCHLIST_MAX })}
              </p>
            )}
          </form>
        </Panel>
      </div>
    ),
  };

  const shown = stacked ? VETTING_SETTINGS_SECTIONS : [section];
  return (
    <div className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
      <nav aria-label={t('vetting.settings.sectionsLabel')} className={sectionRailClassName}>
        <ul className="space-y-px">
          {VETTING_SETTINGS_SECTIONS.map((id) => (
            <li key={id}>
              <SectionRailLink to={settingsSectionPath(id)} active={id === section}>
                {t(`vetting.settings.sections.${id}`)}
                {edited.has(id) && <AttentionDot label={t('vetting.settings.unsaved')} />}
              </SectionRailLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-4">
        {shown.map((id) => (
          <section key={id} aria-labelledby={`${uid}-${id}`} className="space-y-4">
            <h2 id={`${uid}-${id}`} className={stacked ? cx(eyebrowClassName, 'px-1') : 'sr-only'}>
              {t(`vetting.settings.sections.${id}`)}
            </h2>
            {sections[id]}
          </section>
        ))}
        {error && <InlineError>{error}</InlineError>}
        {(dirty || problems.count > 0) && (
          <UnsavedChangesBar
            message={t('vetting.settings.unsaved')}
            problems={
              problems.count > 0 ? t('vetting.settings.problems', { count: problems.count }) : null
            }
            discardLabel={t('vetting.settings.discard')}
            saveLabel={t('vetting.settings.save')}
            onDiscard={() => {
              setDraft(null);
              setSaveFailed(null);
            }}
            onSave={() => void saveDraft()}
            saving={busy === 'draft'}
          >
            {saveFailed && (
              <ActionResult kind="error" className="pt-1">
                {saveFailed}
              </ActionResult>
            )}
          </UnsavedChangesBar>
        )}
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
