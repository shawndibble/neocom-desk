/**
 * "I already paid", checked before anyone is asked: the mining-tax resolve mockups' wallet
 * check (docs/design/mockups/mining-tax-resolve).
 *
 * The pilot's own journal entry already says how much, when, its journal ref and who received
 * it. So the app checks first — the corporation's wallet as the book last synced it (every
 * division), or, for ISK paid to a person, that person's own wallet on their own device — and
 * an officer only ever sees a claim with the search already done.
 */
import type { ReactNode } from 'react';
import { Button, Panel, Radio, TextArea, plainTextActionClassName } from '@/components/ui';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { NewComponent } from './NewComponent';
import {
  BUH,
  CLAIMS,
  DONATIONS,
  LAST_SYNC,
  PILOT,
  TO_CEO,
  TO_OTHER_CORP,
  ASHFALL,
  WALLET_FROM,
  isk,
} from './miningTaxResolveFixtures';
import { Choice, Group, QueueCard, ResolveDialog, SendsTo } from './miningTaxResolveParts';

const noop = () => {};
const textAction = plainTextActionClassName('min-h-9 md:min-h-6');

/** What the wallet check found: one word or two, and a tone that says whether it is settled. */
function Found({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <Pill tone={tone}>{children}</Pill>;
}

function DialogFooter({ label }: { label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost">Cancel</Button>
      <Button variant="primary">{label}</Button>
    </div>
  );
}

/** One transfer from the pilot's journal and what the check made of it. */
function CheckedTransfer({
  status,
  amount,
  at,
  journalRef,
  children,
}: {
  status: ReactNode;
  amount: number;
  at: string;
  journalRef: number;
  children: ReactNode;
}) {
  return (
    <li className="space-y-0.5 py-2 first:pt-0 last:pb-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold tabular-nums">{isk(amount)}</span>
        <span className="text-xs text-text-dim tabular-nums">
          {at} · journal ref {journalRef}
        </span>
        {status}
      </p>
      <p className="text-xs text-text-dim">{children}</p>
    </li>
  );
}

// --- The pilot -----------------------------------------------------------------

/**
 * Two uncredited donations, checked against the corporation's wallet: one was there all along
 * and is credited on the spot; only the other goes to an officer, with the search attached.
 */
export function ResolvePaidChecked() {
  const [found, missing] = DONATIONS;
  return (
    <ResolveDialog
      title="2 donations not credited"
      footer={<DialogFooter label={`Send proof for ${isk(missing.amount)}`} />}
      facts={
        <NewComponent name="WalletCheck">
          <p className="pb-2">
            Checked against {BUH.name}&apos;s wallet, every division, as its book read it on{' '}
            {LAST_SYNC}.
          </p>
          <ul className="divide-y divide-line">
            <CheckedTransfer
              status={<Found tone="success">Found · credited</Found>}
              amount={found.amount}
              at={found.at}
              journalRef={found.ref}
            >
              In its Master wallet at 18:43. {found.days} count as paid again — nobody had to look.
            </CheckedTransfer>
            <CheckedTransfer
              status={<Found tone="danger">Not in its wallet</Found>}
              amount={missing.amount}
              at={missing.at}
              journalRef={missing.ref}
            >
              In none of the 7 divisions. Pays {missing.days} once it is found.
            </CheckedTransfer>
          </ul>
        </NewComponent>
      }
    >
      <Group label="Settle it yourself">
        <Choice
          title={`Pay it again · ${isk(missing.amount)}`}
          hint="Only if that ISK went somewhere else."
        />
        <Choice
          title="Not paying — hide this"
          hint={`Gone from your tab. ${BUH.name} still bills it.`}
        />
      </Group>
      <Group label={`Ask ${BUH.name}`}>
        <Choice
          checked
          title={`I already paid — send the proof for ${isk(missing.amount)}`}
          hint="Sends the transfer and what was checked, so nobody has to search again."
        >
          <TextArea rows={2} placeholder="Add a note (optional)" />
          <SendsTo />
        </Choice>
      </Group>
    </ResolveDialog>
  );
}

/** A billed day the pilot paid — but to the CEO, not the corporation. They pick the payment; the app names who has it. */
export function ResolvePaidPerson() {
  return (
    <ResolveDialog
      title={`${TO_CEO.day} billed · ${isk(TO_CEO.amount)}`}
      footer={<DialogFooter label={`Ask ${BUH.ceo} to confirm`} />}
      facts={
        <p>
          {BUH.name}&apos;s book bills this day. You say you paid it — these are the payments in
          your wallet journal around then.
        </p>
      }
    >
      <NewComponent name="WalletCheck: which payment">
        <fieldset className="space-y-1.5">
          <legend className="pb-1 text-sm font-semibold">Which payment was it?</legend>
          <label className="block cursor-pointer rounded-xs border border-accent bg-accent/5 p-2.5">
            <span className="flex items-start gap-2">
              <Radio name="payment" checked onChange={noop} className="mt-0.5" />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-semibold tabular-nums">{isk(TO_CEO.amount)}</span>
                  <span>to {BUH.ceo}</span>
                  <Found tone="accent">Paid to a person</Found>
                </span>
                <span className="block text-xs text-text-dim tabular-nums">
                  {TO_CEO.at} · journal ref {TO_CEO.ref}
                </span>
                <span className="block text-xs">
                  It went to {BUH.ceo} (CEO), not to the corporation&apos;s wallet — which is why
                  the book can&apos;t see it.
                </span>
              </span>
            </span>
          </label>
          <label className="block cursor-pointer rounded-xs border border-line p-2.5">
            <span className="flex items-start gap-2">
              <Radio name="payment" checked={false} onChange={noop} className="mt-0.5" />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-semibold tabular-nums">{isk(TO_OTHER_CORP.amount)}</span>
                  <span>to {ASHFALL.name}</span>
                  <Found tone="warning">Another corporation</Found>
                </span>
                <span className="block text-xs text-text-dim tabular-nums">
                  {TO_OTHER_CORP.at} · journal ref {TO_OTHER_CORP.ref}
                </span>
              </span>
            </span>
          </label>
          <p className="text-xs text-text-dim">
            {BUH.ceo} gets a card in Needs you and an EVE mail. His own app checks his own wallet
            for it, so he answers with one click and nobody searches.
          </p>
        </fieldset>
      </NewComponent>
    </ResolveDialog>
  );
}

// --- The officer ---------------------------------------------------------------

/** Claims the check settled with nobody involved: one quiet line, with Undo. */
function AutoCredited() {
  return (
    <NewComponent name="AutoCreditedLine">
      <p className="text-xs text-text-dim">
        Credited automatically today: {PILOT}, {isk(DONATIONS[0].amount)} ({DONATIONS[0].at}) —
        found in the Master wallet.{' '}
        <button type="button" className={textAction}>
          Undo
        </button>
      </p>
    </NewComponent>
  );
}

/** Needs you with every "says they paid" card already checked against the corporation's wallet. */
export function OfficerVerified() {
  const { division, old } = CLAIMS;
  const missing = DONATIONS[1];
  return (
    <Panel
      title="Needs you · 3"
      meta={<span className="text-xs text-text-dim">Wallet checked {LAST_SYNC}</span>}
      padded={false}
    >
      <div className="px-3 pt-2.5">
        <AutoCredited />
      </div>
      <NewComponent name="WalletCheck on every card">
        <ul className="divide-y divide-line">
          <QueueCard
            tone="warning"
            title={`${division.who} says they paid · ${isk(division.amount)}`}
            status={<Found tone="warning">Found · Division 3</Found>}
            body={`In ${division.division}, which this book doesn't count. ${division.at}, ref ${division.ref}.`}
            primary="Credit this one"
            secondary="Count Division 3"
          />
          <QueueCard
            tone="danger"
            title={`${PILOT} says they paid · ${isk(missing.amount)}`}
            status={<Found tone="danger">Not in the corp wallet</Found>}
            body={`All 7 divisions checked. Their transfer: ${missing.at}, journal ref ${missing.ref}.`}
            primary="Keep the bill"
            secondary="Confirm paid anyway"
          />
          <QueueCard
            tone="neutral"
            title={`${old.who} says they paid · ${isk(old.amount)}`}
            status={<Found tone="neutral">Too old to check</Found>}
            body={`${old.at} is before the wallet history the book holds (from ${WALLET_FROM}). Their transfer: journal ref ${old.ref}.`}
            primary="Confirm paid"
            secondary="Keep the bill"
          />
        </ul>
      </NewComponent>
    </Panel>
  );
}

/** The CEO's own Needs you: tax paid to him personally, checked in his own wallet on his own device. */
export function OfficerPaidToYou() {
  const theirs = CLAIMS.notInYours;
  return (
    <Panel
      title="Needs you · 2"
      meta={<span className="text-xs text-text-dim">Signed in as {BUH.ceo} (CEO)</span>}
      padded={false}
    >
      <NewComponent name="WalletCheck: paid to you">
        <ul className="divide-y divide-line">
          <QueueCard
            tone="warning"
            title={`${PILOT} says they paid you ${isk(TO_CEO.amount)} as tax`}
            status={<Found tone="success">In your wallet</Found>}
            body={`${TO_CEO.at}, your journal ref ${TO_CEO.theirRef}. The book can't see it because it went to you, not the corporation.`}
            primary="Record it as tax"
            secondary="It wasn't tax"
          />
          <QueueCard
            tone="danger"
            title={`${theirs.who} says they paid you ${isk(theirs.amount)} as tax`}
            status={<Found tone="danger">Not in your wallet</Found>}
            body={`Checked your wallet journal back to ${WALLET_FROM}. Their transfer: ${theirs.at}, journal ref ${theirs.ref}.`}
            primary="Keep the bill"
            secondary="Record it anyway"
          />
        </ul>
      </NewComponent>
    </Panel>
  );
}
