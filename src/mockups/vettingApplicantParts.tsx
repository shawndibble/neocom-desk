/* eslint-disable react-refresh/only-export-components -- mockup parts share constants with their stories */
/**
 * Pieces of the vetting applicant mockups: the public apply page (no account),
 * its character list and sent state, and the member's promotion-review request.
 * Sample data only.
 */
import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  EveSsoButton,
  Eyebrow,
  LogoMark,
  PageHeader,
  Panel,
  Spinner,
  TextArea,
  textActionClassName,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { characterAvatarBoxClassName } from '@/components/ui/characterAvatarBox';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import { samplePortraitDataUri } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';
import { CORP, READS, type ReadState, type VettingCharacter } from './vettingFixtures';

export const PHONE = { viewport: { value: 'mobile1', isRotated: false } };
const noop = () => {};

/** An offline portrait tile, so a mockup with no shell makes no image request. */
export function Portrait({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <img
      src={samplePortraitDataUri(name)}
      alt=""
      className={cx(characterAvatarBoxClassName(size), 'border-line')}
    />
  );
}

/** The public page's frame: a visitor with no account sees the mark, not the rail. */
export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <LogoMark className="size-6" />
        <span className="text-sm font-semibold tracking-wide">Neocom Desk</span>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}

export function ApplyHeading({ sub }: { sub: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">
        Apply to {CORP.name} <span className="text-text-dim">[{CORP.ticker}]</span>
      </h1>
      <p className="text-sm text-text-dim">{sub}</p>
    </div>
  );
}

const STEPS = [
  'Sign in with EVE, once for each of your characters.',
  'Neocom Desk reads each character one time, while you wait.',
  `${CORP.name}'s recruiters get a report. You hear back from them in game.`,
];

export function Steps() {
  return (
    <ol className="space-y-2 text-sm">
      {STEPS.map((step, index) => (
        <li key={step} className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="font-semibold text-text-dim tabular-nums">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * What the read covers, what it leaves alone and how long it is kept: stated
 * before the sign-in, in three short groups (the consent pattern from the
 * Mobbin sample: data accessed, kept private, you're in control).
 */
export function ConsentTerms({ promotion }: { promotion?: boolean }) {
  const readers = promotion ? 'The two officers reviewing you' : 'The recruiters';
  return (
    <NewComponent name="VettingConsentTerms">
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="space-y-2">
          <Eyebrow>{readers} will see</Eyebrow>
          <ul className="space-y-1.5">
            {READS.map((read) => (
              <li key={read.label}>
                {read.label}
                {read.note && <span className="block text-xs text-text-dim">{read.note}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Eyebrow>Not read, not kept</Eyebrow>
            <ul className="space-y-1.5">
              <li>The text of your mail</li>
              <li>
                Your EVE sign-in
                <span className="block text-xs text-text-dim">
                  Neocom Desk keeps no key to your characters, so nothing is read again later
                </span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <Eyebrow>You stay in control</Eyebrow>
            <ul className="space-y-1.5">
              <li>Only {CORP.name}&apos;s reviewers can open the report</li>
              <li>You can see who opened it</li>
              <li>It is deleted 30 days after they decide, or when you withdraw</li>
            </ul>
          </div>
        </div>
      </div>
    </NewComponent>
  );
}

const STATE: Record<ReadState, { label: string; tone: PillTone }> = {
  read: { label: 'Read', tone: 'success' },
  reading: { label: 'Reading', tone: 'neutral' },
  'missing-scope': { label: 'Part missing', tone: 'warning' },
  ready: { label: 'Signed in', tone: 'neutral' },
  'needs-sign-in': { label: 'Needs sign-in', tone: 'warning' },
};

function CharacterLine({
  character,
  tick,
  removable,
}: {
  character: VettingCharacter;
  tick?: boolean;
  removable?: boolean;
}) {
  const state = STATE[character.state];
  const needsFix = character.state === 'missing-scope' || character.state === 'needs-sign-in';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      {tick && (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox aria-label={`Share ${character.name}`} checked onChange={noop} />
        </label>
      )}
      <Portrait name={character.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{character.name}</span>
        <span className="block truncate text-xs text-text-dim">{character.corp}</span>
      </span>
      <span className="flex items-center gap-2">
        {character.state === 'reading' && <Spinner size="sm" />}
        <Pill tone={state.tone}>{state.label}</Pill>
      </span>
      {needsFix && (
        <p className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
          <span>
            {character.missing} was not shared, so the report will say that check could not run.
          </span>
          <button type="button" className={textActionClassName()}>
            Sign in again
          </button>
        </p>
      )}
      {removable && !needsFix && (
        <button type="button" className={cx(textActionClassName(), 'text-xs')}>
          Remove
        </button>
      )}
    </li>
  );
}

export function CharacterList({
  characters,
  tick,
  removable,
}: {
  characters: VettingCharacter[];
  tick?: boolean;
  removable?: boolean;
}) {
  return (
    <NewComponent name="VettingCharacterList">
      <ul className="divide-y divide-line">
        {characters.map((character) => (
          <CharacterLine
            key={character.name}
            character={character}
            tick={tick}
            removable={removable}
          />
        ))}
      </ul>
    </NewComponent>
  );
}

/** Step one of the public page: what happens, what is read, then CCP's own sign-in button. */
export function ApplyStart() {
  return (
    <PublicPage>
      <ApplyHeading
        sub={`${CORP.name} asks every applicant for a one-time read of their characters. It takes about two minutes and needs no Neocom Desk account.`}
      />
      <Panel title="How it works">
        <Steps />
      </Panel>
      <Panel title="What you share">
        <ConsentTerms />
      </Panel>
      <div className="space-y-2">
        <EveSsoButton size="large" label="Log in with EVE Online" pending={false} onClick={noop} />
        <p className="text-xs text-text-dim">
          Start with your main. You add your other characters on the next step.
        </p>
      </div>
    </PublicPage>
  );
}

/** Step two: every character signed in so far, the all-my-characters statement, then Send. */
export function ApplyCharacters({ characters }: { characters: VettingCharacter[] }) {
  return (
    <PublicPage>
      <ApplyHeading sub="Add every character you own, on every account, then send." />
      <Panel
        title="Your characters"
        meta={<span className="text-xs text-text-dim">{characters.length} added</span>}
        padded={false}
      >
        <CharacterList characters={characters} removable />
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-3">
          <EveSsoButton
            size="small"
            label="Add another character with EVE Online"
            pending={false}
            onClick={noop}
          />
          <span className="text-xs text-text-dim">Add another character</span>
        </div>
      </Panel>
      <Panel title="Before you send">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <Checkbox className="mt-0.5" checked onChange={noop} />
            <span>
              These are all my characters.
              <span className="block text-xs text-text-dim">
                Recruiters see who each character trades and contracts with. A character left out
                usually shows up there.
              </span>
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-text-dim">Note to the recruiters (optional)</span>
            <TextArea
              rows={2}
              defaultValue="Vell Hauling is my Jita hauler. Orrin is my brother, we share ISK sometimes."
            />
          </label>
        </div>
      </Panel>
      <div className="flex flex-wrap items-center gap-3 max-sm:[&>button]:w-full">
        <Button variant="primary">Send to {CORP.name}</Button>
        <span className="text-xs text-text-dim">Nothing is sent until you press this.</span>
      </div>
    </PublicPage>
  );
}

/** Step three: sent. Says what was kept, what was not, and how to take it back. */
export function ApplySent() {
  return (
    <PublicPage>
      <ApplyHeading sub="Sent 12 Nov 2026 14:02 EVE." />
      <Panel title={`Sent to ${CORP.name}`}>
        <div className="space-y-3 text-sm">
          <p>
            3 characters were read and the report is with the recruiters. They will contact you in
            game.
          </p>
          <p className="text-text-dim">
            Neocom Desk kept no sign-in for your characters. Nothing more is read unless you share
            again. Keep this page&apos;s link to see who opened the report or to withdraw.
          </p>
          <NewComponent name="VettingOpenedBy">
            <dl className="space-y-1.5">
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="text-text-dim">Opened by</dt>
                <dd>Nobody yet</dd>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="text-text-dim">Deleted</dt>
                <dd>30 days after the decision</dd>
              </div>
            </dl>
          </NewComponent>
          <button type="button" className={textActionClassName()}>
            Withdraw and delete the report…
          </button>
        </div>
      </Panel>
    </PublicPage>
  );
}

/**
 * The member's side of a promotion review, inside the app: who asked and for
 * which role, the characters already on this device (no second sign-in), and
 * Share or Decline.
 */
export function PromotionRequest({ characters }: { characters: VettingCharacter[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <PageHeader
        title="Review requested"
        meta={<span className="text-xs text-text-dim">{CORP.name}</span>}
      />
      <Panel title="Promotion to Director">
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-semibold">Bram Soto</span> (Director) asked for a review before
            you are made <span className="font-semibold">Director</span>. Two other officers read
            the report and each decides on their own.
          </p>
          <p className="text-text-dim">
            This is a one-time read. It also shows what has changed since your application in March
            2026.
          </p>
        </div>
      </Panel>
      <Panel
        title="Characters to share"
        meta={
          <span className="text-xs text-text-dim">2 of 3 are signed in on this device already</span>
        }
        metaOwnRow
        padded={false}
      >
        <CharacterList characters={characters} tick />
      </Panel>
      <Panel title="What you share">
        <ConsentTerms promotion />
      </Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">Share 3 characters</Button>
        <Button>Decline…</Button>
        <span className="text-xs text-text-dim">
          Declining is allowed. The reviewers are told you declined.
        </span>
      </div>
    </div>
  );
}
