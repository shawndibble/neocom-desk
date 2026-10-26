/**
 * The Corp Tax Book's officer dialogs (#4056): Dismiss, Record payment, Mark
 * not tax, Reject declaration and Assign a donation. Each is a `Modal`
 * (a bottom sheet on a phone) built from the shared form primitives; every
 * one says who it is logged as and that the role is checked again on confirm.
 */
import type { ReactNode } from 'react';
import {
  Button,
  IskInput,
  Modal,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  TextInput,
} from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  UNMATCHED,
  VARRO,
  VARRO_BEFORE_NOT_TAX,
  VARRO_DISMISS_AMOUNT,
  TAMSIN,
} from './corpTaxBookFixtures';
import { isk } from './corpTaxBookFormat';

function Label({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-text-dim">{text}</span>
      {children}
    </label>
  );
}

function Footer({ cancel = 'Cancel', confirm }: { cancel?: string; confirm: ReactNode }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost">{cancel}</Button>
      {confirm}
    </div>
  );
}

const LOGGED =
  'Logged as Kestrel Vane, now, with your reason. Your role is checked again when you confirm.';

/** A before → after line, so the officer sees what the action does to the balance. */
function Effect({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xs border border-line bg-panel-2 p-2 text-xs tabular-nums">{children}</p>
  );
}

export function DismissDialog({ open }: { open: boolean }) {
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="Dismiss 2 days of tax?"
      placement={phone ? 'sheet' : 'center'}
      footer={
        <Footer confirm={<Button variant="primary">Dismiss {isk(VARRO_DISMISS_AMOUNT)}</Button>} />
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          17 Oct Sylvite and Zeolites at Efa - Brass Anvil, {isk(VARRO_DISMISS_AMOUNT)} of tax. They
          stay on the record as dismissed and can be reversed.
        </p>
        <Label text="Reason (shown to Varro Kestane)">
          <TextArea value="Ore hauled for the corp's capital build" onChange={() => {}} rows={2} />
        </Label>
        <p className="text-xs text-text-dim">{LOGGED}</p>
      </div>
    </Modal>
  );
}

/** Record payment / Mark paid: ISK that reached the corporation outside the wallet journal. */
export function RecordPaymentDialog({ open }: { open: boolean }) {
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="Record a payment for Varro Kestane"
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Record {isk(VARRO.owed)}</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-dim">
          For ISK the wallet journal cannot show: a contract, another division, a handover in
          person. A donation into the corporation&apos;s wallet is found on its own.
        </p>
        <Label text="Amount">
          <IskInput value={String(VARRO.owed)} onChange={() => {}} aria-label="Amount" />
        </Label>
        <Label text="Paid by">
          <SegmentedControl
            label="Paid by"
            value="varro"
            onChange={() => {}}
            options={[
              { value: 'varro', label: 'Varro Kestane' },
              { value: 'lysa', label: 'Lysa Kestane' },
            ]}
            uppercase={false}
          />
        </Label>
        <Label text="Received on (EVE time)">
          <TextInput value="2026-10-18 13:40" onChange={() => {}} aria-label="Received on" />
        </Label>
        <Effect>
          Credited oldest debt first, to the Aug 2026 Statement. Varro Kestane owes{' '}
          {isk(VARRO.owed)} → {isk(0)}. An overpayment would be held as credit.
        </Effect>
        <p className="text-xs text-text-dim">{LOGGED}</p>
      </div>
    </Modal>
  );
}

/** Mark not tax: all or part of a donation was not a tax payment (e.g. a buyback). */
export function MarkNotTaxDialog({ open }: { open: boolean }) {
  const phone = useIsPhone();
  const before = VARRO_BEFORE_NOT_TAX.owed;
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="Mark part of a donation as not tax"
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Mark {isk(1_000_000)} not tax</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <p>
          Donation from <span className="font-semibold">Lysa Kestane</span>, 16 Oct 21:40,{' '}
          {isk(5_000_000)}, credited to the Aug 2026 Statement.
        </p>
        <Label text="How much of it is not tax">
          <SegmentedControl
            label="How much"
            value="part"
            onChange={() => {}}
            options={[
              { value: 'all', label: `All ${isk(5_000_000)}` },
              { value: 'part', label: 'Part' },
            ]}
            uppercase={false}
          />
        </Label>
        <Label text="Amount not tax">
          <IskInput value="1000000" onChange={() => {}} aria-label="Amount not tax" />
        </Label>
        <Label text="Reason (required)">
          <TextArea value="Buyback of Varro's hulls" onChange={() => {}} rows={2} />
        </Label>
        <Effect>
          The debt reopens by {isk(1_000_000)}: Varro Kestane owes {isk(before)} →{' '}
          {isk(before + 1_000_000)}. The {isk(4_000_000)} left stays credited.
        </Effect>
        <p className="text-xs text-text-dim">
          {LOGGED} It can be reversed from the payment&apos;s ⋮.
        </p>
      </div>
    </Modal>
  );
}

/** Needs-you: reject a Miner's "I paid by contract / other division / wrong corp" declaration. */
export function RejectDeclarationDialog({ open }: { open: boolean }) {
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="Reject Tamsin Holloway's declaration"
      placement={phone ? 'sheet' : 'center'}
      footer={<Footer confirm={<Button variant="primary">Reject declaration</Button>} />}
    >
      <div className="space-y-3 text-sm">
        <p>
          Tamsin Holloway said on 14 Oct that they paid {isk(TAMSIN.owed)} by contract. Overdue has
          been paused since then.
        </p>
        <Label text="Reason (required, shown to Tamsin Holloway on their Statement page)">
          <TextArea
            value="No contract to Brass Meridian Logistics or Kestrel Vane for this amount"
            onChange={() => {}}
            rows={2}
          />
        </Label>
        <Effect>
          Tamsin Holloway gets a fresh 14 days, until 1 Nov, before Overdue counts again. Confirm
          paid instead if the contract turns up.
        </Effect>
        <p className="text-xs text-text-dim">{LOGGED}</p>
      </div>
    </Modal>
  );
}

/** Needs-you: link an Unmatched donation to a Miner. */
export function AssignDonationDialog({ open }: { open: boolean }) {
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="Assign a donation to a Miner"
      placement={phone ? 'sheet' : 'center'}
      footer={
        <Footer confirm={<Button variant="primary">Assign {isk(UNMATCHED.amount)}</Button>} />
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          {isk(UNMATCHED.amount)} from <span className="font-semibold">{UNMATCHED.from}</span>,{' '}
          {UNMATCHED.date}, reason “{UNMATCHED.reason}”. No Miner has this character yet.
        </p>
        <Label text="Miner">
          <Select value="odile" onValueChange={() => {}}>
            <SelectTrigger aria-label="Miner" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="odile">Odile Marchetti</SelectItem>
              <SelectItem value="varro">Varro Kestane</SelectItem>
              <SelectItem value="juno">Juno Rask</SelectItem>
            </SelectContent>
          </Select>
        </Label>
        <Effect>
          Odile Marchetti has nothing owed on a sent Statement, so {isk(UNMATCHED.amount)} is held
          as credit and printed on their next Statement. {UNMATCHED.from} becomes one of their
          characters, so later donations from it credit automatically.
        </Effect>
        <p className="text-xs text-text-dim">
          The player can still claim it themselves from their own lines. {LOGGED}
        </p>
      </div>
    </Modal>
  );
}
