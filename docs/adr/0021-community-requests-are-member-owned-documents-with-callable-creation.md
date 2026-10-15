# 0021 — Community Requests are Member-owned documents, with callable creation

## Status

Accepted (2026-10-14)

## Context

Communities (ADR 0018) copy opted-in Character data into a membership-gated
Firestore collection. Requests add the first Community data that is not a copy
of a Member's own library: a Request is authored by one Member and answered by
others. The scope decisions (`20261014-221403-community-requests-...`) make
Pledges non-exclusive, so nothing needs a transaction to stay correct.

## Decision

- `communities/{id}/itemRequests/{requestId}` holds a Request (lines, location,
  terms, owner uid, timestamps, closed flag). The collection is `itemRequests` because `requests` already holds the Join Requests waiting for the admin (ADR 0018). It is created, extended and
  closed through callables, because creation must enforce caps (open Requests
  per Member, lines per Request) and the mail reservation
  that rules cannot count.
- `communities/{id}/itemRequests/{requestId}/pledges/{uid}` holds one Member's
  Pledges on that Request: per line a quantity, a delivered quantity with
  the contract ids behind it, and an optional typed `manual` amount (the shown
  figure is the larger of contract and manual, never the sum). Written directly by its owner under rules that
  bound quantities and require Community membership; never by another Member.
- Request status is computed on read from lines and Pledges, not stored.
- Delivered quantities are asserted by the Pledger's client from ESI contract
  reads; the server does not hold tokens and cannot verify them. Both parties
  can read the same contract in game, which is the check.
- Mail has its own reserve/confirm/release callables, a parallel copy of the
  invite ones (a NOTE in `communitiesStore.ts` points at the copy), with a
  separate 100-mails-a-day cap and one slot per recipient per Request.
- The Community admin removes any Request or Pledge through
  `removeCommunityRequestCallable` and `removeCommunityPledgeCallable` (admin
  SDK deletes); the rules give the admin's client no write either.
- Leaving or removal deletes a Member's Requests and Pledges, as in ADR 0018.
  The scheduled stale-account purge and the daily `sweepCommunityRequests`
  delete the rest: a Request 7 days after it closes, or 7 days past its
  `expiresAt` (30 days after posting or the last Extend).

## Consequences

No transactions or locks, so the board stays correct under concurrent Pledges
and a Pledge write never contends. Firestore is the `lite` build, so the board
refetches rather than live-updates. Delivery numbers are only as honest as the
Pledger's client, which is acceptable for a tool whose job is to start a
conversation.
