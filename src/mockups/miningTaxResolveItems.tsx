import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { AttentionItem } from '@/features/miningTax/AttentionStrip';
import {
  BUH,
  DONATED,
  DONATIONS,
  DUPLICATE,
  PILOT,
  RATE_DAY,
  isk,
} from './miningTaxResolveFixtures';

export const TODAY_ITEMS: AttentionItem[] = [
  {
    id: 'uncredited',
    tone: 'warning',
    title: `${BUH.name} hasn't credited 2 donations (${isk(DONATED)}) — ask the corp to sync its book`,
    detail: (
      <>
        <p>
          Your wallet journal shows the ISK reached {BUH.name}, and its book reads every wallet
          division — but its last sync doesn&apos;t hold the donations, so they no longer count as
          paid here. Ask the corp to sync its book.
        </p>
        <p>To dispute them, give a {BUH.name} officer these donations from your wallet journal:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {DONATIONS.map((d) => (
            <li key={d.ref}>
              {isk(d.amount)}, sent {d.at} — paid {d.days}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    id: 'duplicates',
    tone: 'warning',
    title: 'Possible double-assigned mining days',
    detail: (
      <>
        <p>
          These days each have two identical Assignments, so the tax is counted twice. Open the day
          and Unassign the extra one — nothing is removed until you do.
        </p>
        <ul className="space-y-0.5">
          <li>
            {PILOT} — {DUPLICATE.date} — {DUPLICATE.system}
          </li>
        </ul>
      </>
    ),
  },
];

export function proposedItems(
  resolve: ReactNode = <Button size="sm">Resolve</Button>
): AttentionItem[] {
  return [
    {
      id: 'uncredited',
      tone: 'warning',
      title: `${BUH.name} hasn't credited 2 donations · ${isk(DONATED)}`,
      detail: (
        <p>
          Its book synced today and still doesn&apos;t hold them, so 3 paid days are billed again.
        </p>
      ),
      action: resolve,
    },
    {
      id: 'rate',
      tone: 'warning',
      title: `${RATE_DAY.date}: ${BUH.name} bills ${RATE_DAY.book}, you recorded ${RATE_DAY.yours}`,
      detail: (
        <p>
          {isk(RATE_DAY.bookTax)} on its book; {isk(RATE_DAY.yourTax)} at your rate. Today this is
          only visible inside Compare with the book.
        </p>
      ),
      action: <Button size="sm">Resolve</Button>,
    },
    {
      id: 'duplicates',
      tone: 'warning',
      title: `${DUPLICATE.date} in ${DUPLICATE.system} is assigned twice`,
      detail: <p>Only one outcome makes sense here, so the button does it — after a confirm.</p>,
      action: <Button size="sm">Drop the duplicate</Button>,
    },
  ];
}

export const AFTER_ITEMS: AttentionItem[] = [
  {
    id: 'kept',
    tone: 'warning',
    title: `${BUH.name} kept the bill on your 2 Nov donation`,
    detail: (
      <p>
        {BUH.ceo}: “We can&apos;t find 25,000,000 ISK on 2 Nov in any division. Send a screenshot of
        the journal line to {BUH.officer}.”
      </p>
    ),
    action: <Button size="sm">Resolve</Button>,
  },
];
