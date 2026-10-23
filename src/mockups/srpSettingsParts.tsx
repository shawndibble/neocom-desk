/* eslint-disable react-refresh/only-export-components -- mockup parts share constants with their stories */
/**
 * Pieces of the SRP settings mockup: the percent fields, the Hull Rules table
 * and the unsaved-changes bar, composed by `SrpSettings.stories.tsx`.
 */
import { useId, useState, type ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  FieldError,
  Field,
  Fields,
  IskInput,
  NativeSelect,
  PageHeader,
  Panel,
  SearchInput,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useIsPhone } from '@/lib/useIsPhone';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { SettingsHint } from '@/features/settings/settingsFields';
import { NewComponent } from './NewComponent';
import {
  CLASSES,
  CORP_NAME,
  HULLS,
  NO_RULE,
  SEARCH_RESULTS,
  SRP_LINK,
  type HullRule,
  type RuleKind,
  type SrpSettingsState,
} from './srpSettingsFixtures';

const RULE_LABEL: Record<RuleKind, string> = {
  none: 'No rule',
  fixed: 'Pay: fixed ISK',
  percent: 'Pay: corp percent',
  notCovered: 'Not covered',
  officer: 'Officer decides',
};

/** A percent is valid when blank (that step of the chain is off) or from 1 to 100. */
export function pctError(value: string): string | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 100)
    return 'Enter a percent from 1 to 100, or leave blank.';
  return null;
}

function fixedError(rule: HullRule): string | null {
  return rule.kind === 'fixed' && rule.isk === ''
    ? 'Enter an ISK amount, or pick another rule.'
    : null;
}

export function countProblems(s: SrpSettingsState): number {
  return (
    (pctError(s.killmailPct) ? 1 : 0) +
    (pctError(s.appraisalPct) ? 1 : 0) +
    Object.values(s.rules).filter((r) => fixedError(r)).length
  );
}

interface Row {
  id: string;
  name: string;
  isClass: boolean;
  classId: string;
}

function percentNote(s: SrpSettingsState): string {
  if (s.killmailPct) return `${s.killmailPct}% of killmail value`;
  if (s.appraisalPct) return `${s.appraisalPct}% of Jita Appraisal`;
  return 'No percent set up';
}

/** The Hull Rules table: class rows expand to their hulls; every row has a rule select and, for a fixed price, an ISK input. */
export function HullRulesTable({
  state,
  setRules,
  toggle,
}: {
  state: SrpSettingsState;
  setRules: (rules: Record<string, HullRule>) => void;
  toggle: (classId: string) => void;
}) {
  const rows: Row[] = CLASSES.flatMap((c) => [
    { id: c.id, name: c.name, isClass: true, classId: c.id },
    ...(state.expanded.includes(c.id)
      ? HULLS.filter((h) => h.classId === c.id).map((h) => ({
          id: h.id,
          name: h.name,
          isClass: false,
          classId: c.id,
        }))
      : []),
  ]);
  const ruleOf = (id: string): HullRule => state.rules[id] ?? NO_RULE;
  const setRule = (id: string, rule: HullRule) => setRules({ ...state.rules, [id]: rule });
  const className = (id: string) => CLASSES.find((c) => c.id === id)?.name ?? '';

  const columns: DataTableColumn<Row>[] = [
    {
      id: 'name',
      header: 'Hull or class',
      render: (row) =>
        row.isClass && HULLS.every((h) => h.classId !== row.id) ? (
          <span className="flex min-h-9 items-center gap-1.5 pl-5 font-semibold">{row.name}</span>
        ) : row.isClass ? (
          <button
            type="button"
            aria-expanded={state.expanded.includes(row.id)}
            onClick={() => toggle(row.id)}
            className="flex min-h-9 items-center gap-1.5 font-semibold"
          >
            {state.expanded.includes(row.id) ? (
              <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            ) : (
              <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            )}
            {row.name}
            <span className="text-xs font-normal text-text-dim">
              {HULLS.filter((h) => h.classId === row.id).length} hull rules
            </span>
          </button>
        ) : (
          <span className="pl-6">{row.name}</span>
        ),
    },
    {
      id: 'rule',
      header: 'Rule',
      render: (row) => (
        <NativeSelect
          size="sm"
          className="w-48"
          aria-label={`Rule for ${row.name}`}
          value={ruleOf(row.id).kind}
          onChange={(e) => setRule(row.id, { ...ruleOf(row.id), kind: e.target.value as RuleKind })}
        >
          {(Object.keys(RULE_LABEL) as RuleKind[]).map((k) => (
            <option key={k} value={k}>
              {k === 'none' && !row.isClass ? 'No rule (follows class)' : RULE_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      render: (row) => {
        const rule = ruleOf(row.id);
        const err = fixedError(rule);
        const errId = `fixed-err-${row.id}`;
        if (rule.kind === 'fixed')
          return (
            <div className="grid w-56 gap-1">
              <IskInput
                value={rule.isk}
                onChange={(isk) => setRule(row.id, { ...rule, isk })}
                aria-label={`Fixed price for ${row.name}`}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? errId : undefined}
                size="sm"
              />
              {err && <FieldError id={errId}>{err}</FieldError>}
            </div>
          );
        if (rule.kind === 'percent') return <span>{percentNote(state)}</span>;
        if (rule.kind === 'officer') return <span className="text-text-dim">Officer types it</span>;
        if (rule.kind === 'notCovered')
          return <span className="text-text-dim">Pilots cannot file it</span>;
        return (
          <span className="text-text-dim">
            {row.isClass
              ? state.killmailPct || state.appraisalPct
                ? `Follows percent: ${percentNote(state)}`
                : 'Officer types it'
              : `Follows ${className(row.classId)}`}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      label="Hull Rules"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowClassName={(r) => (ruleOf(r.id).kind === 'notCovered' ? 'bg-panel-2' : undefined)}
      stackColumns={1}
    />
  );
}

/** Phone Hull Rules: collapsed class rows, one line each (name, count, rule select); a second line only for a fixed price. */
export function HullRulesPhone({
  state,
  setRules,
  toggle,
}: {
  state: SrpSettingsState;
  setRules: (rules: Record<string, HullRule>) => void;
  toggle: (classId: string) => void;
}) {
  const ruleOf = (id: string): HullRule => state.rules[id] ?? NO_RULE;
  const setRule = (id: string, rule: HullRule) => setRules({ ...state.rules, [id]: rule });
  const line = (id: string, name: string, isClass: boolean, classId: string, count: number) => {
    const rule = ruleOf(id);
    const err = fixedError(rule);
    const open = state.expanded.includes(id);
    const helper =
      rule.kind === 'percent'
        ? percentNote(state)
        : rule.kind === 'officer'
          ? 'Officer types it'
          : rule.kind === 'notCovered'
            ? 'Pilots cannot file it'
            : rule.kind === 'none'
              ? isClass
                ? state.killmailPct || state.appraisalPct
                  ? `Follows percent: ${percentNote(state)}`
                  : 'Officer types it'
                : `Follows ${CLASSES.find((c) => c.id === classId)?.name}`
              : null;
    return (
      <li
        key={id}
        className={cx(
          'border-b border-line py-1 last:border-b-0',
          !isClass && 'ml-4 border-l pl-3',
          rule.kind === 'notCovered' && 'bg-panel-2'
        )}
      >
        <div className="flex min-h-11 items-center gap-2">
          {isClass && count > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(id)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left font-semibold"
            >
              {open ? (
                <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
              ) : (
                <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
              )}
              <span className="min-w-0 break-words">{name}</span>
            </button>
          ) : (
            <span className={cx('min-w-0 flex-1 break-words', isClass && 'pl-5 font-semibold')}>
              {name}
            </span>
          )}
          <NativeSelect
            size="sm"
            className="w-40 shrink-0"
            aria-label={`Rule for ${name}`}
            value={rule.kind}
            onChange={(e) => setRule(id, { ...rule, kind: e.target.value as RuleKind })}
          >
            {(Object.keys(RULE_LABEL) as RuleKind[]).map((k) => (
              <option key={k} value={k}>
                {RULE_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {rule.kind === 'fixed' ? (
          <div className="grid gap-1 pb-2">
            {isClass && count > 0 && (
              <p className="text-xs text-text-dim">
                {count} {count === 1 ? 'rule' : 'rules'}
              </p>
            )}
            <IskInput
              value={rule.isk}
              onChange={(isk) => setRule(id, { ...rule, isk })}
              aria-label={`Fixed price for ${name}`}
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? `fixed-err-${id}` : undefined}
              size="sm"
            />
            {err && <FieldError id={`fixed-err-${id}`}>{err}</FieldError>}
          </div>
        ) : (
          <p className="pb-1 text-xs text-text-dim">
            {isClass && count > 0
              ? `${count} ${count === 1 ? 'rule' : 'rules'} · ${helper}`
              : helper}
          </p>
        )}
      </li>
    );
  };
  return (
    <ul aria-label="Hull Rules" className="min-w-0">
      {CLASSES.flatMap((c) => {
        const hulls = HULLS.filter((h) => h.classId === c.id);
        return [
          line(c.id, c.name, true, c.id, hulls.length),
          ...(state.expanded.includes(c.id)
            ? hulls.map((h) => line(h.id, h.name, false, c.id, 0))
            : []),
        ];
      })}
    </ul>
  );
}

/** Add-hull search with its result list; a hull that already has a rule says so instead of offering Add. */
export function AddHullSearch({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  return (
    <div className="grid gap-2">
      <SearchInput
        className="w-full sm:max-w-sm"
        aria-label="Add a hull"
        placeholder="Add a hull by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() !== '' && (
        <NewComponent name="HullSearchResults">
          <ul className="grid w-full divide-y sm:max-w-sm divide-line rounded-xs border border-line bg-panel-2 text-sm">
            {SEARCH_RESULTS.map(({ hull, classLabel, hasRule }) => (
              <li key={hull.id} className="flex min-h-11 items-center gap-2 px-3">
                <span className="min-w-0 flex-1 truncate">
                  {hull.name} <span className="text-xs text-text-dim">{classLabel}</span>
                </span>
                {hasRule ? (
                  <span className="text-xs text-text-dim">Has a rule</span>
                ) : (
                  <Button size="sm">Add</Button>
                )}
              </li>
            ))}
          </ul>
        </NewComponent>
      )}
    </div>
  );
}

function PercentField({
  id,
  label,
  note,
  value,
  onChange,
}: {
  id: string;
  label: string;
  note: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const err = pctError(value);
  const errId = `${id}-err`;
  return (
    <Field label={label} htmlFor={id} note={note}>
      <div className="flex items-center gap-2">
        <TextInput
          id={id}
          inputMode="numeric"
          className="w-24"
          value={value}
          placeholder="Off"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-text-dim">%</span>
      </div>
      {err && (
        <FieldError id={errId} className="w-full">
          {err}
        </FieldError>
      )}
    </Field>
  );
}

/** Bar shown (sticky to the viewport foot in the product; static here so a full-page screenshot shows it at the end) while edits are unsaved: Discard and Save; Save waits while a field is invalid. */
export function UnsavedBar({ problems }: { problems: number }) {
  const phone = useIsPhone();
  return (
    <div
      className={
        phone ? 'sticky bottom-0 z-10 -mx-4 border-t border-line bg-panel px-4 py-2' : 'mt-2'
      }
    >
      <NewComponent name="UnsavedChangesBar">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 basis-full text-sm sm:basis-0 sm:flex-1" role="status">
            {problems > 0 ? (
              <span className="flex items-center gap-1.5 text-danger">
                <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {problems} {problems === 1 ? 'problem' : 'problems'} to fix before saving
              </span>
            ) : (
              'Unsaved changes'
            )}
          </p>
          <Button className="max-sm:flex-1">Discard</Button>
          <Button
            className="max-sm:flex-1"
            variant="primary"
            aria-disabled={problems > 0 ? true : undefined}
          >
            Save
          </Button>
        </div>
      </NewComponent>
    </div>
  );
}

/** First-time state: SRP off, a short explainer and one primary action. */
export function FirstTimePanel() {
  return (
    <Panel title="Ship replacement program">
      <EmptyState
        title="SRP is not turned on"
        hint="SRP repays pilots for lost ships. Pilots file a claim from a killmail, officers approve and pay it. Turn it on to set percents and rules."
      />
      <div className="flex justify-center px-3 pb-3">
        <Button variant="primary" className="max-sm:w-full">
          Turn on SRP
        </Button>
      </div>
      <div className="px-3 pb-3">
        <SettingsHint>Only a Director can turn SRP on. The CEO can reclaim it.</SettingsHint>
      </div>
    </Panel>
  );
}

/** The whole settings page; `state` is the saved-then-edited form. */
export function SrpSettingsPage({
  initial,
  dirty = false,
  searchText = '',
}: {
  initial: SrpSettingsState;
  dirty?: boolean;
  searchText?: string;
}) {
  const [s, setS] = useState(initial);
  const uid = useId();
  const phone = useIsPhone();
  const patch = (p: Partial<SrpSettingsState>) => setS({ ...s, ...p });
  const problems = countProblems(s);
  const showBar = dirty || problems > 0 || JSON.stringify(s) !== JSON.stringify(initial);
  const toggle = (id: string) =>
    patch({
      expanded: s.expanded.includes(id) ? s.expanded.filter((x) => x !== id) : [...s.expanded, id],
    });
  const win = Number(s.windowDays);
  const winErr = s.windowDays !== '' && !(win >= 1 && win <= 365);
  return (
    <div className="mx-auto grid max-w-4xl gap-4 px-4 pt-4 pb-0">
      <PageHeader title="SRP settings" meta={CORP_NAME} />
      <Panel title="Ship replacement program">
        <div className="grid gap-4">
          <SettingsHint>
            Directors only. Changes apply to every officer and pilot in the corp.
          </SettingsHint>
          <Fields variant="form">
            <Field
              label="SRP"
              htmlFor={`${uid}-on`}
              inline
              note="Off hides the pilot page and the Corp Board widget's data."
            >
              <label className={touchCheckboxLabelClassName}>
                <Checkbox
                  id={`${uid}-on`}
                  checked={s.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                />
              </label>
              <span className="text-sm">SRP is on</span>
            </Field>
            <Field
              label="Link for corp chat"
              htmlFor={`${uid}-link`}
              note="Post it so pilots find the page."
            >
              {phone ? (
                <p id={`${uid}-link`} className="w-full truncate text-sm text-text-dim">
                  {SRP_LINK}
                </p>
              ) : (
                <TextInput
                  id={`${uid}-link`}
                  readOnly
                  value={SRP_LINK}
                  className="min-w-0 flex-1"
                />
              )}
              <Button className="max-sm:w-full">
                <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                Copy link
              </Button>
            </Field>
          </Fields>
        </div>
      </Panel>
      <Panel title="How the amount is worked out">
        <div className="grid gap-4">
          <ol className="grid max-w-2xl list-decimal gap-1 pl-5 text-sm">
            <li>The hull's fixed price, if its Hull Rule has one.</li>
            <li>Killmail value × Killmail percent.</li>
            <li>Jita Appraisal of the killmail's items × Jita Appraisal percent.</li>
            <li>Otherwise the officer types it.</li>
          </ol>
          <Fields variant="form">
            <PercentField
              id={`${uid}-km`}
              label="Killmail percent"
              note="Leave blank to skip this step."
              value={s.killmailPct}
              onChange={(killmailPct) => patch({ killmailPct })}
            />
            <PercentField
              id={`${uid}-ap`}
              label="Jita Appraisal percent"
              note="Used when the killmail has no value. Leave blank to skip."
              value={s.appraisalPct}
              onChange={(appraisalPct) => patch({ appraisalPct })}
            />
          </Fields>
        </div>
      </Panel>
      <Panel
        title="Hull Rules"
        meta="A hull beats its class. A hull with no rule follows the percents above."
        wrapMeta
      >
        <div className="grid gap-3">
          <AddHullSearch initial={searchText} />
          {phone ? (
            <HullRulesPhone state={s} setRules={(rules) => patch({ rules })} toggle={toggle} />
          ) : (
            <HullRulesTable state={s} setRules={(rules) => patch({ rules })} toggle={toggle} />
          )}
        </div>
      </Panel>
      <Panel title="Claims">
        <Fields variant="form">
          <Field
            label="Claim window"
            htmlFor={`${uid}-win`}
            note="Days after the loss that a pilot can still file."
          >
            <TextInput
              id={`${uid}-win`}
              inputMode="numeric"
              className="w-24"
              value={s.windowDays}
              aria-invalid={winErr ? true : undefined}
              onChange={(e) => patch({ windowDays: e.target.value })}
            />
            <span className="text-text-dim">days</span>
            {winErr && (
              <FieldError id={`${uid}-win-err`} className="w-full">
                Enter 1 to 365 days.
              </FieldError>
            )}
          </Field>
          <Field
            label="Fleet or FC"
            htmlFor={`${uid}-fc`}
            inline
            note="Pilots must name the fleet or FC when they file."
          >
            <label className={touchCheckboxLabelClassName}>
              <Checkbox
                id={`${uid}-fc`}
                checked={s.fleetRequired}
                onChange={(e) => patch({ fleetRequired: e.target.checked })}
              />
            </label>
            <span className="text-sm">Required on every claim</span>
          </Field>
        </Fields>
      </Panel>
      {showBar ? <UnsavedBar problems={problems} /> : <div className="pb-4" />}
    </div>
  );
}

export function FirstTimePage(): ReactNode {
  return (
    <div className="mx-auto grid max-w-4xl gap-4 px-4 pt-4 pb-4">
      <PageHeader title="SRP settings" meta={CORP_NAME} />
      <FirstTimePanel />
    </div>
  );
}
