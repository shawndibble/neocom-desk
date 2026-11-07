import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { Widget } from './Widget';
import { blank } from './data/builderKit';
import type { KindView } from './data/types';
import type { Widget as WidgetModel } from './layout';

/**
 * A new pilot's Overview: every card empty. Each empty card says what it has nothing of,
 * then what the kind is for (its Gallery description), then its Open link when the kind
 * has one. No Remove button: Remove lives in the ⋮ menu.
 */
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

/** @summary Empty Mining yield, Mining survey, Route safety and Hauling cards: description and Open link, no Remove. */
export const NewPilot: Story = { render: () => <Board /> };

/** @summary The same empty cards in the phone shell. */
export const NewPilotPhone: Story = { ...NewPilot, globals: PHONE };
