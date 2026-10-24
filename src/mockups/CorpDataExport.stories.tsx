import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { setSrpBackendOverride } from '@/features/corp/srpBackendOverride';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import { setSrpDoctrineBackendOverride } from '@/features/corp/srpDoctrineBackendOverride';
import { CorpSrp } from '@/routes/CorpSrp';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { createDoctrineFixture, createSrpFixture } from '@/storybook/srpFixture';
import { createSrpMemberFixture, SRP_FIXTURE_CORPORATION_ID } from '@/storybook/srpMemberFixture';
import { MOONS_PARAMS, PHONE_GLOBALS } from './corpTaxBookFormat';
import {
  BookSettingsAccessMock,
  DeleteBookStory,
  SrpExportPanel,
  type DeleteVariant,
} from './corpDataExportParts';

/**
 * Export a corporation's Corp Tax Book and SRP data (#4946): one download per
 * dataset, offered in the "Delete the book?" confirmation, in the book
 * settings' Access tab, and in SRP Settings. Proposed format: one Excel
 * workbook (.xlsx) with a sheet per record type. Two variants of the Delete
 * dialog: A (Export button, Delete stays usable) and B (Delete inert until the
 * export has downloaded from the dialog).
 *
 * New components in this mockup:
 * - `ExportFirst`: the "Export first" block in the Delete the book dialog.
 * - `ExportBookSection`: the standing "Export the book" section on the book
 *   settings' Access tab, above Delete the book.
 * - `SrpExportPanel`: the Export panel at the foot of SRP Settings.
 * All three are a heading, a hint and one `Button` with `Icon.Download` (one
 * format, so a download button, not a menu). Everything else is the real
 * `Modal`, `Tabs`, `AutomaticSyncSection`, `DeleteBookSection` and the real
 * `/corp/srp` Settings page.
 */
const meta = {
  title: 'mockups/CorpDataExport',
  tags: ['!manifest'],
  parameters: MOONS_PARAMS,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = PHONE_GLOBALS;

const del = (variant: DeleteVariant, phone = false): Story => ({
  render: () => <DeleteBookStory variant={variant} />,
  ...(phone ? { globals: PHONE } : {}),
});

/** @summary Today: Delete the book? as it ships, no way to keep a copy. */
export const DeleteToday = del('today');
/** @summary Today, phone: the bottom sheet. */
export const DeleteTodayPhone = del('today', true);

/** @summary A: an Export first block in the dialog; Delete stays usable once the ticker is typed. New component: ExportFirst. */
export const DeleteExportA = del('a');
/** @summary A, phone. */
export const DeleteExportAPhone = del('a', true);

/** @summary B: Export first is step 1; Delete stays inert (aria-disabled, reason beside it) until the export has downloaded here. New component: ExportFirst. */
export const DeleteExportB = del('b');
/** @summary B, phone. */
export const DeleteExportBPhone = del('b', true);

/** @summary B after the download: the file name and row count, and Delete now live. */
export const DeleteExportBDone = del('b-done');
/** @summary B after the download, phone. */
export const DeleteExportBDonePhone = del('b-done', true);

/** @summary Book settings › Access: a standing Export the book section above Delete the book. New component: ExportBookSection. */
export const BookSettingsExport: Story = { render: () => <BookSettingsAccessMock /> };
/** @summary Book settings › Access, phone. */
export const BookSettingsExportPhone: Story = { ...BookSettingsExport, globals: PHONE };

// ---------------------------------------------------------------- SRP Settings
// The same stand-ins as `pages/CorpSrp` (src/routes/CorpSrp.stories.tsx), for a configured Director.

const SHIP_GROUPS: Record<number, string> = {
  25: 'Frigate',
  26: 'Cruiser',
  27: 'Battleship',
  28: 'Industrial',
  419: 'Combat Battlecruiser',
  420: 'Destroyer',
  547: 'Carrier',
};

const srpRoutes = (): FixtureRoute[] => [
  {
    path: /^\/characters\/\d+\/roles$/,
    respond: () => ({ body: { roles: ['Director'] } }),
  },
  {
    path: /^\/universe\/groups\/\d+$/,
    respond: ({ url }) => {
      const id = Number(url.pathname.split('/').pop());
      return { body: { group_id: id, name: SHIP_GROUPS[id] ?? `Ship group ${id}` } };
    },
  },
];

const seedCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: SRP_FIXTURE_CORPORATION_ID })
    )
  );
};

/** Every corp scope (a Director is `ready`), plus standings so the broker-fee notice stays out of the picture. */
const SCOPES = [
  ...new Set([
    ...Object.values(CORP_SCOPES_FOR_CAPABILITY).flat(),
    'esi-characters.read_standings.v1',
  ]),
];

const SRP_PARAMS = {
  layout: 'fullscreen',
  shell: { path: '/corp/srp/settings', routes: srpRoutes, scopes: SCOPES, seed: seedCorporation },
};

function SampleSrp({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    setSrpMemberBackendOverride(createSrpMemberFixture(Date.now(), {}));
    setSrpBackendOverride(createSrpFixture('director', 'configured'));
    setSrpDoctrineBackendOverride(createDoctrineFixture('sample'));
    return () => {
      setSrpMemberBackendOverride(null);
      setSrpBackendOverride(null);
      setSrpDoctrineBackendOverride(null);
    };
  }, []);
  return children;
}

const withSampleSrp: Decorator = (Story) => (
  <SampleSrp>
    <Story />
  </SampleSrp>
);

/** @summary SRP Settings (Director): an Export panel after Claims with one Download SRP data (.xlsx) button. New component: SrpExportPanel. */
export const SrpSettingsExport: Story = {
  decorators: [withSampleSrp],
  parameters: SRP_PARAMS,
  render: () => (
    <>
      <CorpSrp />
      <SrpExportPanel />
    </>
  ),
};
/** @summary SRP Settings with the Export panel, phone. */
export const SrpSettingsExportPhone: Story = { ...SrpSettingsExport, globals: PHONE };
