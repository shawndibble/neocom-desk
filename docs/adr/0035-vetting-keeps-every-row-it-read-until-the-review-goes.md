# 0035 — Vetting keeps every row it read until the review goes

## Status

Accepted (2026-11-17). Supersedes only the "inputs are deleted on Send" part of
ADR 0033's "What is stored"; the rest of ADR 0033 stands (no token stored, the
same scopes, officers only, the same retention dates).

## Context

ADR 0033 deleted what a read returned when the report was sent, and kept the
flags (up to 10 evidence rows each) and a few facts per character. An officer
could see why a flag fired but not the journal, contacts, mail headers,
contracts, skills or corporation history behind it, so a "Nothing found" could
not be checked and a flag could not be put in context (#6341).

## Decision

Keep **every row the read returned**, uncapped, with the review, and delete it
on the dates the review is already deleted: 30 days after the decision, 90 days
after it was shared if nobody decides, when the pilot deletes the review, and
the draft and request rules unchanged.

- **What is kept.** Per character and source (wallet, contacts, mail, contracts,
  skills, corporation history): ids, times, amounts, the source's own word for
  the row (`ref_type`, contract type and status, contact kind and standing, skill
  id and level, stay start and end), and the name and category of each id a row
  names. Mail is headers only (sender or first recipient, every recipient id,
  Sent or Received, time): never a subject or text. No journal description, no
  contract title. No token. Scopes and the 30-day wallet window are unchanged.
- **Where.** `corps/{c}/vettingReviews/{r}/rawRows/{characterId}_{gen}_{source}_{seq}`,
  rows chunked by serialized size (400 KB of rows plus names, well under
  Firestore's 1 MiB), each chunk's rows and names as JSON strings (as `inputs`
  does, so thousands of rows cost no index entries). `gen` is a token per read.
  Each stored character names its read's `gen` and the chunk and row count per
  source; the review keeps `rawCounts` (rows per source, all characters) from
  Send. The officer's page reads exactly the chunks the metadata names, so a
  chunk left by a failed or replaced read is never shown: every delete of a
  chunk is hygiene for data nobody can reach, not what keeps it private.
- **Who reads it.** Rules deny every client. An officer reads one chunk per page
  through `getVettingRawRowsCallable` (a `vetting` router action): CEO,
  Director or Personnel_Manager, role checked live per call, a draft is not
  visible, and the pilot, a character on the report and another character of an
  account one was read from are refused (as for the flags). The page's open is
  logged like opening the report: one line per officer per hour, not one per
  source or page.
- **Lifecycle.** Written when a character is added (a re-read writes a new
  generation and then drops the old one). Deleted with `inputs` wherever a draft
  is dropped (remove character, expiry, decline, the sweep's `clear-inputs`);
  kept at Send for the characters on the report; deleted with the review
  (withdraw, the sweep's delete).
- **Ordering rule.** The sweep re-decides the review in its own transaction, so
  chunks are pruned only after it commits (a review re-decided to "keep" meanwhile
  keeps its rows). It prunes through the held reference, which lists chunks after
  the parent is deleted; a prune failure counts as `failed` and is logged, and
  leaves chunks no review names: unreachable, never shown. Withdraw deletes the
  chunks first (and again after the review). Chunks are written outside the
  review's transaction: its commit is capped at 10 MiB and 30,000 rows is several
  MiB. A chunk write that fails partway is deleted by exact id.
- **State.** Only a shared report's rows are readable: a `requested` or
  `declined` review answers `not-found`, since a member can still add characters
  to a request before sharing.
- **Additive.** Dev and production share one Firestore. A review stored before
  this has no `rawRows`, no per-character metadata and no `rawCounts`; it works
  as before and its officer view omits `rawCounts`.

## Consequences

- The raw rows of a review are stored data about a pilot who may never join:
  more than ADR 0033 kept. The consent page says so before the pilot signs in,
  and the retention dates are the same as the report's.
- Firestore size per review grows from a few KB to a few MB for a busy trader.
- The wallet window, scopes and the no-token rule are unchanged; a longer
  window or an export are separate changes.
- A crash between the review's delete and the second chunk delete in a withdraw
  can leave chunks no review names; they are unreachable but not deleted. The
  sweep does not look for them (it finds reviews, not their chunks).

## Considered Options

- **One stored document per row.** Simple, but 30,000 writes per read.
  Rejected.
- **Cap the rows kept, as the checks do (5,000 dealings).** Rejected: the point
  is that an officer can see all of it.
- **Delete the rows at Send and keep only flags (ADR 0033).** The status quo.
