import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter } from '@/test/seed';
import type { DonutChartModel } from './charts/types';
import type { KindView } from './data/types';
import { Widget } from './Widget';
import type { Widget as WidgetModel } from './layout';

const widget: WidgetModel = {
  id: 'w1',
  kind: 'militaryCampaigns',
  size: 'M',
  view: 'number',
  scope: 'all',
  showOnPhone: true,
};

const donut = (completed: number, summary: string): DonutChartModel => ({
  kind: 'donut',
  parts: [{ key: 'complete', label: 'Complete', value: completed, color: 'accent' }],
  of: 4,
  centre: '',
  centreNote: '',
  summary,
});

const view = (over: Partial<KindView> = {}): KindView => ({
  status: { loading: false, needsPermission: false, error: false, hasData: true, isEmpty: false },
  fetchedAt: null,
  fromCache: false,
  number: { value: '1 of 4', unit: 'objectives complete', tone: 'clear' },
  rows: [],
  deadlines: [],
  summary: '',
  to: null,
  ...over,
});

afterEach(async () => {
  await db.characters.clear();
});

describe('Widget number rings', () => {
  it('draws one ring beside the figure', () => {
    render(
      <MemoryRouter>
        <Widget
          widget={widget}
          previewView={view({
            number: {
              value: '1 of 4',
              unit: 'objectives complete',
              tone: 'clear',
              rings: [{ key: 'c', label: 'Caldari', donut: donut(1, 'Caldari: 1 of 4') }],
            },
          })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Caldari: 1 of 4')).toHaveClass('sr-only');
  });

  it('draws one named ring per campaign in place of the figure', () => {
    render(
      <MemoryRouter>
        <Widget
          widget={widget}
          previewView={view({
            number: {
              value: 'Caldari 1/4 · Minmatar 2/4',
              tone: 'clear',
              secondary: { text: '~73.1M waiting to turn in' },
              rings: [
                { key: 'c', label: 'Caldari 1/4', donut: donut(1, 'Caldari: 1 of 4') },
                { key: 'm', label: 'Minmatar 2/4', donut: donut(2, 'Minmatar: 2 of 4') },
              ],
            },
          })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Caldari 1/4')).toBeInTheDocument();
    expect(screen.getByText('Minmatar 2/4')).toBeInTheDocument();
    expect(screen.queryByText('Caldari 1/4 · Minmatar 2/4')).toBeNull();
    expect(screen.getByText('~73.1M waiting to turn in')).toBeInTheDocument();
  });

  it('puts one Military Campaigns mark in the header for the Characters lacking it', async () => {
    await seedCharacter(9, 'Mira Solenne');
    render(
      <MemoryRouter>
        <Widget
          widget={widget}
          previewView={view({
            headerMark: {
              characterId: 9,
              characterName: 'Mira Solenne',
              permission: 'militaryCampaigns',
              why: 'Lets this widget list them.',
            },
          })}
        />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: /Mira Solenne/ })).toBeInTheDocument();
  });
});
