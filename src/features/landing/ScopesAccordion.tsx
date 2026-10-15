import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui/Disclosure';
import { PERMISSIONS } from '@/esi/registry';
import { LANDING_SCOPE_GROUPS, type ScopeRow } from './scopeGroups';

/** The i18n keys and opt-in flag of one row. */
function rowMeta(row: ScopeRow): {
  id: string;
  labelKey: string;
  captionKey: string;
  optIn: boolean;
} {
  if (row.kind === 'core') {
    return {
      id: `core-${row.key}`,
      labelKey: `permissions.core.${row.key}.label`,
      captionKey: `permissions.core.${row.key}.caption`,
      optIn: false,
    };
  }
  const meta = PERMISSIONS[row.group];
  return {
    id: row.group,
    labelKey: meta.labelKey,
    captionKey: meta.captionKey,
    optIn: !meta.defaultOn,
  };
}

/**
 * What the app asks EVE for, by area, closed by default: each row shows the
 * area's name and how many permissions it holds, so the closed list scans like
 * a table of contents. Rows are the same Permissions the Customize
 * permissions dialog offers, with the same captions.
 */
export function ScopesAccordion() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  return (
    <div className="divide-y divide-line border border-line bg-bg/60">
      {LANDING_SCOPE_GROUPS.map(({ id, rows }) => (
        <Disclosure
          key={id}
          label={t(`login.scopes.groups.${id}`)}
          trailing={t('login.scopes.count', { count: rows.length })}
          expanded={open.has(id)}
          onToggle={() => toggle(id)}
        >
          {rows.map((row) => {
            const { id: rowId, labelKey, captionKey, optIn } = rowMeta(row);
            return (
              <div key={rowId} className="px-3 py-2 text-sm">
                <p className="font-semibold">
                  {t(labelKey)}
                  {optIn && (
                    <span className="ml-2 text-[0.6875rem] font-medium tracking-widest text-text-dim uppercase">
                      {t('permissions.customize.optInTag')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-text-dim">{t(captionKey)}</p>
              </div>
            );
          })}
        </Disclosure>
      ))}
    </div>
  );
}
