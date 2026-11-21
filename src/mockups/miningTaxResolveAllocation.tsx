/**
 * Where a member's payment to a Corp Tax Book landed, as the officer reads it
 * (docs/design/mockups/mining-tax-resolve). The member's side of paying a book shipped as Settle
 * up's preview off the Miner's Running account (`SettleUpDialog`), so its mockup is gone.
 */
import { Panel } from '@/components/ui';
import { PAYING, PILOT, RATE_DAY, isk } from './miningTaxResolveFixtures';
import { QueueCard } from './miningTaxResolveParts';

/** The officer's card says where the member's money went, and what is held. */
export function OfficerHeldDay() {
  return (
    <Panel title="Needs you · 1" padded={false}>
      <ul>
        <QueueCard
          newName="QueueCard: where it landed"
          tone="neutral"
          title={`${PILOT} isn't paying ${RATE_DAY.date} · ${isk(RATE_DAY.bookTax)}`}
          body={`“The fleet boss said this op was untaxed.” Their ${isk(PAYING)} on 16 Nov paid 2026-10-29 and 2026-10-30; ${RATE_DAY.date} is held until you answer.`}
          primary="Write off"
          secondary="Keep the bill"
        />
      </ul>
    </Panel>
  );
}
