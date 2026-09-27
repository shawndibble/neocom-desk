# Scope decisions — Next deadline includes accepted/tentative calendar events

_Recorded 2026-09-27._

- **The Overview board's "Next deadline" strip now considers the pilot's calendar, but only events answered `accepted` or `tentative`.** An unanswered or declined event is not a plan the pilot has made, so it must not compete with a real deadline — the same reasoning `20260925-203743` already applies to a courier contract's own listing window. The soonest qualifying event's severity is drawn from the shared `severityForRemaining` ladder (`engine/severity.ts`), since a calendar clock is not inherently more or less urgent than an industry job or a colony batch the same distance out.
