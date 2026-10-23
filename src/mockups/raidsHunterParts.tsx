import type { ReactNode } from 'react';
import { Widget } from '@/features/overview/widgets/Widget';
import { createFeedStore } from '@/features/overview/widgets/data/feedStore';
import { FeedStoreContext } from '@/features/overview/widgets/data/feedStoreContext';
import { OverviewRefreshContext } from '@/features/overview/widgets/data/refreshContext';
import type { KindView } from '@/features/overview/widgets/data/types';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import { Eyebrow, SegmentedControl } from '@/components/ui';

const store = createFeedStore();
const refresh = () => undefined;
const remove = () => undefined;

/** The real Widget shell drawing a hand-built view: what the Gallery does for its previews. */
export function Card({
  kind,
  view,
  size,
  title,
  data,
  width,
}: {
  kind: 'sovRaids' | 'routeSafety';
  view: 'number' | 'table';
  size: 'S' | 'M';
  title?: string;
  data: KindView;
  width: string;
}) {
  const widget: WidgetModel = {
    id: `${kind}-${view}-${title ?? ''}`,
    kind,
    size,
    view,
    title,
    scope: 'header',
    showOnPhone: true,
  };
  return (
    <div style={{ width, maxWidth: '100%' }}>
      <FeedStoreContext.Provider value={store}>
        <OverviewRefreshContext.Provider value={{ epoch: 0, refresh }}>
          <Widget widget={widget} previewView={data} onRemove={remove} />
        </OverviewRefreshContext.Provider>
      </FeedStoreContext.Provider>
    </div>
  );
}

/** The proposed widget-menu section, drawn as a static replica of the real menu's groups. */
export function MenuReplica({ children }: { children: ReactNode }) {
  return (
    <div className="w-64 rounded-xs border border-line-bright bg-panel-2 p-2 text-[0.8125rem] shadow-lg">
      {children}
    </div>
  );
}

export function RadioRow({ label, on }: { label: string; on?: boolean }) {
  return (
    <div role="radio" aria-checked={on === true} className="flex min-h-9 items-center gap-2 px-2">
      <span className={on ? 'text-accent' : 'text-transparent'}>●</span>
      {label}
    </div>
  );
}

export function WhereSegmented({ value }: { value: 'mine' | 'near' }) {
  return (
    <div className="grid gap-1">
      <Eyebrow>Where</Eyebrow>
      <SegmentedControl
        label="Where"
        value={value}
        onChange={() => undefined}
        options={[
          { value: 'mine', label: 'My alliance' },
          { value: 'near', label: 'Near me' },
        ]}
        uppercase={false}
      />
    </div>
  );
}
