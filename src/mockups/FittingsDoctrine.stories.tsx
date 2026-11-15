import { useEffect, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import { db } from '@/db';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting, FittingModule } from '@/engine/fittings/types';
import { setSrpDoctrineBackendOverride } from '@/features/corp/srpDoctrineBackendOverride';
import type { MemberDoctrineFit } from '@/features/corp/srpTypes';
import { FittingStartScreen } from '@/features/fittings/FittingStartScreen';
import type { FittingLibrarySource } from '@/features/fittings/useFittingPicker';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';

/**
 * #6202: a corp member's Fittings library lists the corp's SRP Doctrine Fits beside their own
 * Saved Fittings, each tagged Doctrine and grouped under its hull. Picking one previews it for the
 * viewer's own skills; Open, Compare and Save a copy work as for a Community's Fitting.
 *
 * "Thorax - brawl" was saved after this change, so it keeps its charges and drones. "Rifter -
 * tackle" was saved before, so it holds only its modules and rigs and its preview carries the
 * re-save note.
 *
 * The real `FittingStartScreen`, with the Doctrine list answered by the backend stand-in. No new
 * components. Sample data.
 */

const mod = (
  slot: FittingModule['slot'],
  slotIndex: number,
  typeId: number,
  chargeTypeId?: number
): FittingModule => ({
  slot,
  slotIndex,
  typeId,
  state: 'active',
  ...(chargeTypeId ? { chargeTypeId } : {}),
});

const THORAX: Fitting = {
  name: 'Thorax - brawl',
  shipTypeId: 627,
  modules: [
    mod('high', 0, 3138, 12789),
    mod('high', 1, 3138, 12789),
    mod('high', 2, 3138, 12789),
    mod('medium', 0, 12058),
    mod('medium', 1, 448),
    mod('medium', 2, 527),
    mod('low', 0, 3530),
    mod('low', 1, 10190),
    mod('low', 2, 2048),
    mod('rig', 0, 31047),
  ],
  drones: [{ typeId: 2456, quantity: 5, state: 'online' }],
  cargo: [{ typeId: 28668, quantity: 50 }],
};

const MY_RIFTER: Fitting = {
  name: 'My solo Rifter',
  shipTypeId: 587,
  modules: [
    mod('high', 0, 2889, 21898),
    mod('high', 1, 2889, 21898),
    mod('medium', 0, 438),
    mod('medium', 1, 448),
    mod('low', 0, 2048),
    mod('low', 1, 519),
    mod('rig', 0, 31668),
  ],
  drones: [],
  cargo: [],
};

async function code(fitting: Fitting): Promise<string> {
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  if (!encoded.ok) throw new Error('sample fit too large');
  return encoded.payload;
}

async function doctrineFits(): Promise<MemberDoctrineFit[]> {
  return [
    {
      id: 'thorax',
      name: THORAX.name,
      snapshot: { hullTypeId: 627, name: THORAX.name, modules: [448, 527], rigs: [31047] },
      shareCode: await code(THORAX),
    },
    {
      id: 'rifter',
      name: 'Rifter - tackle',
      // saved before Doctrine Fits kept the whole fit: modules and rigs only
      snapshot: {
        hullTypeId: 587,
        name: 'Rifter - tackle',
        modules: [438, 448, 527, 2048, 2889, 2889],
        rigs: [31358],
      },
    },
  ];
}

const seed = async () => {
  // the app learns the corporation from the public-info read; the list keys on it
  await db.characters.update(SAMPLE_ACTIVE_CHARACTER.characterId, {
    corporationId: SAMPLE_ACTIVE_CHARACTER.corporationId,
  });
  await db.fittings.put({
    id: 'mine-rifter',
    characterId: SAMPLE_ACTIVE_CHARACTER.characterId,
    name: MY_RIFTER.name,
    code: await code(MY_RIFTER),
    updatedAt: 1,
  });
};

const workspace: FittingLibrarySource = {
  lastLoad: null,
  shareError: null,
  tooLargeToShare: false,
  loadFromInput: async () => {},
  loadFittingXmlDocument: async () => [],
  openLoaded: async () => {},
  openSaved: () => {},
};

/** Sets the Doctrine stand-in before the screen mounts, and clears it after. */
function WithDoctrines({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void doctrineFits().then((fits) => {
      if (cancelled) return;
      setSrpDoctrineBackendOverride({
        list: () => [],
        save: () => ({ id: 'x' }),
        remove: () => {},
        memberList: () => fits,
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
      setSrpDoctrineBackendOverride(null);
    };
  }, []);
  return ready ? children : null;
}

const meta = {
  title: 'mockups/FittingsDoctrine',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/fittings', seed } },
  render: () => (
    <WithDoctrines>
      <div className="mx-auto max-w-page px-4 pt-4">
        <FittingStartScreen
          workspace={workspace}
          catalogue={null}
          characterId={SAMPLE_ACTIVE_CHARACTER.characterId}
          inGameKey={0}
          onStartHull={() => {}}
        />
      </div>
    </WithDoctrines>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Focus previews a row, as a hover does. */
const preview =
  (name: RegExp): Story['play'] =>
  async ({ canvasElement }) => {
    (await within(canvasElement).findByRole('button', { name }, { timeout: 10_000 })).focus();
  };

/** @summary The Start list with the corp's Doctrine Fits (Doctrine tag) beside a Saved Fitting; the whole-fit Thorax previewed. */
export const DoctrineRows: Story = { play: preview(/^Thorax - brawl/) };

/** @summary A Doctrine Fit saved before the change: previewed with modules and rigs only, plus the re-save note. */
export const OlderDoctrineFit: Story = { play: preview(/^Rifter - tackle/) };

/** @summary The phone list: no preview pane, so the older fit's row carries the re-save note. */
export const DoctrineRowsPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
