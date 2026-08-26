# ADR-0006 — The corridor view is not a map

## Status

Accepted — 2026-08-26. Revisit at phase 2.

## Context

The UX design specifies a map as the shipper's primary view, backed by
self-hosted MapLibre tiles or a Mapbox contract. That is right for the shipped
product and it is not free: a native SDK on both platforms, a tile budget that
the backend spec calls out as a real line item, an API key in the build, and
tile downloads over exactly the connection that is already the user's problem.

None of that belongs in phase 0, whose exit gate is about the domain boundary
holding — not about rendering geography.

But a trip screen with no spatial view at all is not a trip screen. The
shipper's question is *where is it, and is it moving?*, and a list of
coordinates does not answer it.

## Decision

The shipper's trip screen shows a **corridor**: the route drawn to scale as a
single line, with the truck's measured progress along it, and the stretches
where the signal was lost marked grey in the position they happened.

It is drawn with `react-native-svg` from the trip's own cleaned track. There
are no tiles, no key, no native SDK and no network.

Two details in it are load-bearing:

- **Progress is measured distance along the track, not the straight line to the
  destination.** A detour a driver was made to take is distance they drove, and
  a progress bar that jumps backwards when a truck rounds a hill is a bar
  nobody trusts twice.
- **Coverage gaps are drawn where they happened**, not summarised underneath. A
  shipper looking at a long unexplained stretch is asking *where* it was, and
  the answer is a position on that line.

It is labelled and shaped so nobody mistakes it for a map. It does not show
roads, towns it did not pass through, or a north arrow.

## Consequences

The phase 0 build has a spatial view that runs on a 2 GB Transsion handset with
nothing to download, and the tile decision stays open until there is a reason
to make it.

What is given up is real: a shipper cannot see *which road*, cannot tell a
motorway stop from a town, and cannot judge whether a stall is somewhere
plausible. Those matter, and they are why a real map is a phase 2 exit-gate
item rather than a nice-to-have — the pilot ends with a shipper tracking a
truck on a real corridor, and by then this is not enough.

There is a trap here worth naming: the corridor view is *pleasant*, and a
pleasant placeholder is the kind of thing that quietly becomes permanent. The
revisit is pinned to phase 2's gate rather than to anyone's judgement about
whether it still feels sufficient.
