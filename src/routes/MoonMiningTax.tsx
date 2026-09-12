import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, PageHeader, Spinner, Tabs } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { TaxTab } from '@/features/miningTax/TaxTab';
import { OverviewTab } from '@/features/miningTax/OverviewTab';

type MiningTab = 'tax' | 'overview';

/**
 * Mining (issue #671): renamed from "Moon Mining" — the route path and every
 * internal module/component name stay `MoonMiningTax`/`miningTax`
 * (decision doc `20260905-215631`), this is a label/structure change only.
 * `Tax` (default) is the unchanged rent/tax ledger; `Overview` is the new
 * personal-output stats tab. The two tabs load independent data, so each
 * owns its own fetch/refresh lifecycle rather than sharing one snapshot —
 * this shell only resolves the active Character gate they'd otherwise each
 * repeat.
 *
 * Each tab reports its own `fetchedAt` up via `onDataAgeChange` so the shared
 * `PageHeader` can show it in its `meta` slot next to the title, the same
 * place every other route puts a `DataAgeBadge` — the tab-local row it used
 * to sit in otherwise had nothing else on its left. Switching tabs resets it
 * rather than showing the other tab's stale figure.
 */
export function MoonMiningTax() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = useState<MiningTab>('tax');
  const [dataAge, setDataAge] = useState<Date | null>(null);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('miningTax.title')} meta={dataAge && <DataAgeBadge date={dataAge} />} />
      <Tabs
        label={t('miningTax.title')}
        value={tab}
        onChange={(id) => {
          setDataAge(null);
          setTab(id as MiningTab);
        }}
        tabs={[
          { id: 'tax', label: t('miningTax.taxTab') },
          { id: 'overview', label: t('miningTax.overviewTab') },
        ]}
      />
      {tab === 'tax' ? (
        <TaxTab onDataAgeChange={setDataAge} />
      ) : (
        <OverviewTab onDataAgeChange={setDataAge} />
      )}
    </div>
  );
}
