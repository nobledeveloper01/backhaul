# ADR-0021 — A carrier hands a trip to a driver before the wheel turns, and the handover is a row

## Status

Accepted — 2026-09-17.

## Context

ADR-0019 opens a trip at award with the carrier in the driver's slot, and
says the hand-over to a real driver "is a later, separate action and is not
this ADR". That action never arrived. A fleet's carrier is driver of record
for every awarded load, the driver who actually turns the wheel has no trip on
their phone, and the tracker — which runs on the driver's device (ADR-0002) —
runs on the wrong one.

Three shapes were considered.

**Mutate the driver slot and nothing else.** One column on the trip, one
`PUT`. It loses who drove before, which is the fact a dispute about the
loading hours needs; ADR-0003 exists to keep facts like that.

**A new trip event.** The history is the trip's state machine, held to
`fixtures/parity.json` on both sides, and a "driver changed" event is not a
state — it would either be a fake transition or a second kind of row in a
table whose order is its meaning.

**A separate append-only row, plus the slot.** The trip's `DriverId` is what
authorisation reads (ADR-0008), so it moves; the history of who held it is a
`TripDrivers` table nothing updates or deletes.

When may it happen? A handover mid-transit is a real thing — a relief driver
at Jebba — but the tracker is on the first phone and the second has never
seen the trip, and the fixes between the two would be attributed to whoever
the slot said at upload. That is a phase-3 fleet question with its own
design. Before the wheel turns there is no such gap.

## Decision

**`POST /v1/trips/{id}/driver`, by the carrier, while the trip is `open`,
`assigned` or `loading`.** The body names the driver by phone number, as
`open` does (ADR-0016): the carrier has a number, not an id, and the same
"find or make a party" rule applies. Handing to oneself is refused as a
mistake, not silently a no-op.

**The rule lives in the domain first.** `canHandOver(state)` in
`packages/domain/src/trip.ts`, mirrored in `TripMachine.CanHandOver`, and a
`handsOver` column on the parity fixture's state rows — so the C# side is
held to it the way it is held to `shouldTrack`.

**Every handover is a row in `TripDrivers`**: trip, the driver it went to,
the driver it left, who did it, when. Nothing updates or deletes one. The
first row for a trip is written at award (the carrier, from nobody), so the
table reads as the trip's whole driving history and not only its changes.

**The previous driver stops seeing the trip.** Authorisation is the slot,
and the slot moved. They kept nothing they had earned — before the wheel
turns there is nothing to earn — and a driver who was the carrier still sees
it as the carrier.

## Consequences

The awarded load reaches the phone that will actually be tracked, which is
what ADR-0019 promised and could not deliver. `tierOf` still counts per
carrier and is unaffected.

The mid-transit relief driver is written down as refused, with the reason,
rather than left as an unstated gap. When the fleet phase takes it up, the
`TripDrivers` table is already the place its history goes.

A carrier can hand a trip to a number that has never signed in. That is the
same as opening one for such a number today: the party exists, the trip is
theirs when they arrive, and until then nobody drives it — which is honest,
and visible to the shipper as a trip that has not started.
