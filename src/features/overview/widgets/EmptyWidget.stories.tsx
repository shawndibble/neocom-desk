import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { Widget } from './Widget';
import { blank } from './data/builderKit';
import type { KindView } from './data/types';
import type { Widget as WidgetModel } from './layout';

const meta = {
  title: 'overview/EmptyWidget',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const EMPTY = {
  loading: false,
  needsPermission: false,
  error: false,
  hasData: true,
  isEmpty: true,
};

function emptyView(to: string, emptyLinkLabel?: string): KindView {
  return { ...blank(to, EMPTY), emptyLinkLabel };
}

function tile(id: string, kind: WidgetModel['kind']): WidgetModel {
  return { id, kind, size: 'M', view: 'number', scope: 'header', showOnPhone: true };
}

function Board(): ReactNode {
  const { t } = useTranslation();
  const cards: [WidgetModel, KindView][] = [
    [
      tile('yield', 'miningYield'),
      emptyView('/mining', t('overview.widgets.miningYield.emptyLink')),
    ],
    [tile('survey', 'survey'), emptyView('/mining/survey', t('overview.widgets.survey.emptyLink'))],
    [
      tile('route', 'routeSafety'),
      emptyView('/travel/route', t('overview.widgets.routeSafety.emptyLink')),
    ],
    [
      tile('hauling', 'hauling'),
      emptyView('/market/hauling', t('overview.widgets.hauling.emptyLink')),
    ],
  ];
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-8">
      <PageHeader title="Overview" />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([widget, view]) => (
          <Widget key={widget.id} widget={widget} previewView={view} />
        ))}
      </div>
    </div>
  );
}

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

export const NewPilot: Story = { render: () => <Board /> };

export const NewPilotPhone: Story = { ...NewPilot, globals: PHONE };
