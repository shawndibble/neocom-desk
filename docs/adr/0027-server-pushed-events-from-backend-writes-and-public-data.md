# 0027 — Server-pushed events from our own writes and public data, chosen per device

## Status

Accepted (2026-10-25). Extends ADR 0010 and ADR 0020.

## Context

ADR 0010 pushes to a closed app only what a device can predict and upload
ahead. ADR 0020 added one server poll, under a narrow token, for EVE
notifications. Some events need neither prediction nor a token: the backend
writes the community ones itself (join requests, new Members, Pledges), and
price alerts and ship losses come from public data (Fuzzwork, zKillboard). They
fired only from the open app's Foreground Poller.

## Decision

The backend pushes these events itself, to the devices that chose them.

- **Per device, per Character, like ADR 0020's types.** `registerDevice` gains
  `serverEvents` (the events this device enabled for the browser channel) and
  `serverInputs` (what the server cannot read: the Quickbar's price targets and
  hub, the ship-lost minimum). The device remains the only source of its own
  choices; nothing is read from synced data.
- **Community events: a Firestore trigger on the backend's write**, pushed at
  once to the admin's (or requester's) devices.
- **Price alerts and ship losses: the existing 15-minute dispatch tick** reads
  the public sources once per hub station and once per Character, and diffs per
  device against readings stored on the device's registration doc, with the
  Foreground Poller's own edge rules.
- **The push carries the raw fire**; the service worker renders it with the
  app's copy and keys the feed row with the poller's Occurrence Key derivation.
- Still no EVE token for any of this. Quiet Time applies.

## Consequences

- ADR 0010's "only events whose time is known ahead are pushed" no longer
  holds for these five events; its Projection design is unchanged.
- The backend now stores, per device, a Character's price targets and hub and
  a loss minimum, and reads public data about Characters that opted in.
- Two Firestore triggers join the deployed functions; deploys stay manual and
  the web client works against an older function (unknown fields are ignored).
- Price and loss pushes are up to about 15 minutes late; community pushes are
  immediate.
