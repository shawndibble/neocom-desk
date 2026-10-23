/**
 * The Hull Rules panel body: an add-hull search over the whole SDE ship list, then
 * every ship class with its rule select and, under an expanded class, the hulls that carry a rule.
 * A hull's rule beats its class's. Table from `sm` up; one-line rows on a phone (classes collapsed,
 * ISK input only for Pay: fixed ISK). Rows come from `hullRuleRows.ts`.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  FieldError,
  IskInput,
  NativeSelect,
  SearchInput,
  type DataTableColumn,
} from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { HULL_RULE_KINDS } from '../srpTypes';
import { HullSearchResults } from './HullSearchResults';
import { searchHulls } from './hullCatalog';
import { buildHullRuleRows, isNotCovered, listedHullIds, type HullRuleRow } from './hullRuleRows';
import {
  formProblems,
  ruleKey,
  ruleOf,
  setRule,
  type RuleChoice,
  type SrpSettingsForm,
} from './srpSettingsForm';
import type { HullCatalogState } from './useHullCatalog';

const CHOICES: readonly RuleChoice[] = ['none', ...HULL_RULE_KINDS];

interface Props {
  form: SrpSettingsForm;
  onChange: (form: SrpSettingsForm) => void;
  hulls: HullCatalogState;
  /** Hull ids added from the search that have no rule yet; kept by the editor so they survive a re-render. */
  added: readonly number[];
  onAdd: (hullId: number) => void;
  expanded: ReadonlySet<number>;
  onToggle: (classId: number) => void;
}

export function HullRulesEditor({
  form,
  onChange,
  hulls,
  added,
  onAdd,
  expanded,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const { catalog, className } = hulls;
  const [query, setQuery] = useState('');
  const problems = useMemo(() => formProblems(form), [form]);
  const listed = useMemo(
    () => (catalog ? listedHullIds(form, catalog, added) : new Set<number>()),
    [form, catalog, added]
  );
  // A hull whose fixed price is blank stays on screen even if its class is collapsed: Save is blocked on it.
  const shown = useMemo(() => {
    const open = new Set(expanded);
    if (catalog)
      for (const key of problems.fixedIsk) {
        const hull = key.startsWith('hull:') ? catalog.hull(Number(key.slice(5))) : undefined;
        if (hull) open.add(hull.classId);
      }
    return open;
  }, [expanded, problems, catalog]);
  const rows = useMemo(
    () => (catalog ? buildHullRuleRows(catalog, className, listed, shown) : []),
    [catalog, className, listed, shown]
  );
  const results = useMemo(() => (catalog ? searchHulls(catalog, query) : []), [catalog, query]);

  // An invalid percent is not shown as the rule's meaning: the field already says what is wrong.
  const percentNote = (): string | null =>
    form.killmailPct.trim() !== '' && !problems.killmailPct
      ? t('srp.settings.hullRules.percentKillmail', { pct: form.killmailPct })
      : form.appraisalPct.trim() !== '' && !problems.appraisalPct
        ? t('srp.settings.hullRules.percentAppraisal', { pct: form.appraisalPct })
        : null;

  /** The dim line under or beside a row's select: what the rule means for the claim. */
  const helper = (row: HullRuleRow): string => {
    const kind = ruleOf(form, row.scope, row.id).kind;
    if (kind === 'pay-percent') return percentNote() ?? t('srp.settings.hullRules.percentNeeded');
    if (kind === 'officer-decides') return t('srp.settings.hullRules.officerTypes');
    if (kind === 'not-covered') return t('srp.settings.hullRules.notCoveredNote');
    if (row.scope === 'hull')
      return t('srp.settings.hullRules.followsClass', { name: className(row.classId) });
    const note = percentNote();
    return note
      ? t('srp.settings.hullRules.followsPercent', { note })
      : t('srp.settings.hullRules.officerTypes');
  };

  const choose = (row: HullRuleRow, kind: RuleChoice) =>
    onChange(setRule(form, row.scope, row.id, { ...ruleOf(form, row.scope, row.id), kind }));
  const setIsk = (row: HullRuleRow, isk: string) =>
    onChange(setRule(form, row.scope, row.id, { ...ruleOf(form, row.scope, row.id), isk }));

  const kindLabel = (row: HullRuleRow, kind: RuleChoice) =>
    kind === 'none' && row.scope === 'hull'
      ? t('srp.settings.hullRules.kinds.noneHull')
      : t(`srp.settings.hullRules.kinds.${kind}`);

  const select = (row: HullRuleRow, className_: string) => (
    <NativeSelect
      size="sm"
      className={className_}
      aria-label={t('srp.settings.hullRules.ruleFor', { name: row.name })}
      value={ruleOf(form, row.scope, row.id).kind}
      onChange={(e) => choose(row, e.target.value as RuleChoice)}
    >
      {CHOICES.map((k) => (
        <option key={k} value={k}>
          {kindLabel(row, k)}
        </option>
      ))}
    </NativeSelect>
  );

  const iskInput = (row: HullRuleRow) => {
    const key = ruleKey(row.scope, row.id);
    const invalid = problems.fixedIsk.includes(key);
    const errId = `srp-fixed-err-${key.replace(':', '-')}`;
    return (
      <div className="grid gap-1">
        <IskInput
          size="sm"
          value={ruleOf(form, row.scope, row.id).isk}
          onChange={(isk) => setIsk(row, isk)}
          aria-label={t('srp.settings.hullRules.fixedFor', { name: row.name })}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errId : undefined}
        />
        {invalid && <FieldError id={errId}>{t('srp.settings.hullRules.fixedRequired')}</FieldError>}
      </div>
    );
  };

  const toggleButton = (row: HullRuleRow, tall: boolean) => {
    const open = shown.has(row.id);
    const Caret = open ? Icon.Expanded : Icon.Descend;
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(row.id)}
        className={cx(
          'flex min-w-0 items-center gap-1.5 rounded-xs text-left font-semibold',
          focusRingClassName,
          tall ? 'min-h-11 flex-1' : 'min-h-9'
        )}
      >
        <Caret size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 break-words">{row.name}</span>
        {!tall && (
          <span className="text-xs font-normal text-text-dim">
            {t('srp.settings.hullRules.hullCount', { count: row.count })}
          </span>
        )}
      </button>
    );
  };

  const columns: DataTableColumn<HullRuleRow>[] = [
    {
      id: 'name',
      header: t('srp.settings.hullRules.hullOrClass'),
      render: (row) =>
        row.scope === 'hull' ? (
          <span className="pl-6">{row.name}</span>
        ) : row.count > 0 ? (
          toggleButton(row, false)
        ) : (
          <span className="flex min-h-9 items-center pl-5 font-semibold">{row.name}</span>
        ),
    },
    {
      id: 'rule',
      header: t('srp.settings.hullRules.rule'),
      render: (row) => select(row, 'w-48'),
    },
    {
      id: 'amount',
      header: t('srp.settings.hullRules.amount'),
      render: (row) =>
        ruleOf(form, row.scope, row.id).kind === 'pay-fixed' ? (
          <div className="w-56">{iskInput(row)}</div>
        ) : (
          <span className="text-text-dim">{helper(row)}</span>
        ),
    },
  ];

  const phoneLine = (row: HullRuleRow) => {
    const kind = ruleOf(form, row.scope, row.id).kind;
    const isClass = row.scope === 'class';
    const countText =
      isClass && row.count > 0 ? t('srp.settings.hullRules.ruleCount', { count: row.count }) : null;
    return (
      <li
        key={ruleKey(row.scope, row.id)}
        className={cx(
          'border-b border-line py-1 last:border-b-0',
          !isClass && 'ml-4 border-l pl-3',
          kind === 'not-covered' && 'bg-panel-2'
        )}
      >
        <div className="flex min-h-11 items-center gap-2">
          {isClass && row.count > 0 ? (
            toggleButton(row, true)
          ) : (
            <span className={cx('min-w-0 flex-1 break-words', isClass && 'pl-5 font-semibold')}>
              {row.name}
            </span>
          )}
          {select(row, 'w-40 shrink-0')}
        </div>
        {kind === 'pay-fixed' ? (
          <div className="grid gap-1 pb-2">
            {countText && <p className="text-xs text-text-dim">{countText}</p>}
            {iskInput(row)}
          </div>
        ) : (
          <p className="pb-1 text-xs text-text-dim">
            {countText ? `${countText} · ${helper(row)}` : helper(row)}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <SearchInput
          className="w-full sm:max-w-sm"
          aria-label={t('srp.settings.hullRules.searchLabel')}
          placeholder={t('srp.settings.hullRules.searchPlaceholder')}
          value={query}
          disabled={!catalog}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() !== '' && (
          <HullSearchResults
            results={results.map((h) => ({
              id: h.id,
              name: h.name,
              classLabel: className(h.classId),
              listed: listed.has(h.id),
            }))}
            onAdd={(id) => {
              onAdd(id);
              setQuery('');
            }}
          />
        )}
      </div>
      {phone ? (
        <ul aria-label={t('srp.settings.hullRules.tableLabel')} className="min-w-0">
          {rows.map(phoneLine)}
        </ul>
      ) : (
        <DataTable
          label={t('srp.settings.hullRules.tableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(r) => ruleKey(r.scope, r.id)}
          rowClassName={(r) => (isNotCovered(form, r) ? 'bg-panel-2' : undefined)}
          stackColumns={1}
        />
      )}
    </div>
  );
}
