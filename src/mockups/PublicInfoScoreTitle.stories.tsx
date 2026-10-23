import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PublicInfoModal } from '@/components/PublicInfoModal';
import { Contacts } from '@/routes/Contacts';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { Inject } from './ScoreTitleInject';
import { findModalLine } from './scoreTitleTargets';
import {
  CONTACTS_SCOPES,
  LOOKUP_PILOT,
  scoreTitleFixtureRoutes,
  seedScoreTitle,
} from './characterScoreTitleFixtures';

/** Opens the shared modal on a pilot, as a row click on Contacts does. */
function OpenOnMount({ id }: { id: number }) {
  useEffect(() => {
    usePublicInfoModalStore.getState().show({ kind: 'character', id });
    return () => usePublicInfoModalStore.getState().clear();
  }, [id]);
  return null;
}

/**
 * Issue #4777 in the public info modal (Show info), opened from a Contacts row.
 * Its Character tab is Pilot Lookup's `PilotProfileView`, so the line shows on
 * Travel › Pilot Lookup too.
 */
const meta = {
  title: 'mockups/PublicInfoScoreTitle',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: {
      path: '/contacts',
      routes: scoreTitleFixtureRoutes,
      scopes: CONTACTS_SCOPES,
      seed: seedScoreTitle,
    },
  },
  render: () => (
    <>
      <Contacts />
      <PublicInfoModal />
      <OpenOnMount id={LOOKUP_PILOT.id} />
    </>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The Show info modal's Character tab today, desktop. */
export const Today: Story = {};

/** @summary The Show info modal's Character tab today, phone. */
export const TodayPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

const findLookupLine = findModalLine(LOOKUP_PILOT);

/** @summary Proposed: a line under the corporation · alliance line. */
export const Proposed: Story = {
  render: () => (
    <>
      <Contacts />
      <PublicInfoModal />
      <OpenOnMount id={LOOKUP_PILOT.id} />
      <Inject find={findLookupLine} />
    </>
  ),
};

/** @summary Proposed, phone. */
export const ProposedPhone: Story = {
  ...Proposed,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
