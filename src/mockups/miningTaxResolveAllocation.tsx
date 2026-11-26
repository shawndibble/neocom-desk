import { Panel } from '@/components/ui';
import { PAYING, PILOT, RATE_DAY, isk } from './miningTaxResolveFixtures';
import { QueueCard } from './miningTaxResolveParts';

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
