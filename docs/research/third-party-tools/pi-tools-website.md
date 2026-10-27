# Planetary Interaction Tools website (EWT)

Thread: https://forums.eveonline.com/t/introducing-planetary-interaction-tools-website/247573 | read 2026-10-07 (.json summary + www.eve-webtools.com/Planetary; older thread, Pochven update mentioned)

## What

Esnaelc Sin'led's all-in-one PI site, inspired by Alysii's PI Scheme and defunct PI Helper.

## Features

| Feature                                                 | Tool does                                 | Neocom Desk  | Evidence                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| Commodity relations (inputs/outputs, Jita sell, qty)    | yes (P0-P4 graph, lock lines, price link) | HAVE         | planetary-industry.md Map (planet types x P0-P4, product drawer)                                         |
| System checker: what a system can produce               | yes                                       | PARTIAL      | Map has planet richness drawer, Find best uses home system; per-system "what can I make here" unverified |
| Setup builder (layout testing)                          | yes                                       | HAVE/PARTIAL | planetary-industry.md CPU/PG fitColony, linkCost, throughput; no drag-drop layout canvas                 |
| Template library (import/export, voting)                | yes                                       | MISSING      | community sharing needs a server; local import/export of templates maybe feasible                        |
| Colony planner (simulate templates -> production value) | yes                                       | HAVE         | Goal Planner, chain estimates                                                                            |
| User planets: colonies, storage limits, multi-char      | yes                                       | HAVE         | Colonies tab; storage via pins                                                                           |
| Contrast/accessibility colour mode                      | added after feedback                      | unverified   | DESIGN.md check                                                                                          |
| Planets coloured when P2/P3 exclusively producible      | yes                                       | PARTIAL      | Map board; unverified                                                                                    |

## Calculations worth borrowing

Nothing new: our docs already cover link CPU/PG (15+0.2km, 10+0.15km, x1.4^lvl / 1.2^lvl), pin costs, throughput. Site itself did not expose formulas (fetch gave only P0-P4 counts).

## Candidate gaps

1. PI template import/export (share a colony layout by link/file) - inferred; community voting out (server).
   Complaints: low contrast text, System Checker lag - avoid.

## Out of scope

Template voting (server-held shared state).
