import type { ReactNode } from 'react';
import { Tabs, useTabsId } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { MoonsHeader } from './corpTaxBookParts';
import type { PopState } from './moonsAllMoonsFixtures';

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>;
}

export function MoonsChrome({ tab }: { tab: 'moons' | 'extractions' }) {
  const tabsId = useTabsId();
  return (
    <>
      <MoonsHeader />
      <Tabs
        tabsId={tabsId}
        label="Corp Tax Book"
        value={tab}
        onChange={() => {}}
        tabs={[
          { id: 'extractions', label: 'Extractions' },
          { id: 'moons', label: 'Moons' },
          { id: 'miners', label: 'Miners' },
          { id: 'late-notices', label: 'Late notices' },
          { id: 'moon-owners', label: 'Moon owners' },
          { id: 'sharing', label: 'Sharing' },
        ]}
      />
    </>
  );
}

const STATE_TONE: Record<PopState, string> = {
  extracting: 'text-text-dim',
  ready: 'text-success',
  fractured: 'text-warning',
  expired: 'text-text-faint',
  cancelled: 'text-text-faint',
};

export function StateWord({ state }: { state: PopState }) {
  return (
    <span
      className={cx(
        'text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
        STATE_TONE[state]
      )}
    >
      {state}
    </span>
  );
}

export function Crumb({ label }: { label: string }) {
  return (
    <a
      href="/corp/moons/moons"
      className={cx(inlineLinkClassName, 'inline-flex items-center gap-1 text-xs')}
    >
      <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {label}
    </a>
  );
}

export function MoonLink({ name, id }: { name: string; id?: string }) {
  return (
    <a href={`/corp/moons/moons/${id ?? 'm1'}`} className={entityLinkClassName('font-medium')}>
      {name}
    </a>
  );
}
