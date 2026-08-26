# Feature backlog

What is known to be missing, why it is missing, and what would unblock it.
Ordered by when it becomes a problem, not by how interesting it is.

An item here is a decision that has been made — to defer — not a wish.

---

## Blocked on data

### F1 — Corridor-segmented ETA

**Status:** deferred, deliberately.

The technical design specifies ETA as the sum of per-segment empirical
transit-time distributions, conditioned on time of day and day of week, falling
back to a regional average below 20 historical trips on a corridor.

What exists today is that fallback tier: pace measured from the trip's own
track, or a class average before the truck has moved. It is honest about which
it is using — `isModelled` is carried on every estimate and rendered.

The corridor tier needs a corpus of completed trips. Building it now would
produce a model fitted to nothing, dressed in the authority of a distribution.

**Unblocked by:** roughly 20 completed trips per corridor, which arrives during
the phase 2 pilot.

### F2 — Rate bands from corridor history

Indicative pricing is currently a table of per-kilometre rates by truck class,
written from market knowledge and marked indicative everywhere it appears. It
will drift with diesel.

**Unblocked by:** enough completed trips with agreed fares to derive bands
empirically. Roadmap phase 7.

---

## Blocked on the app layer

### F3 — Stall and deviation alerts

`observe()` returns `stalled` and `silent` correctly and nothing consumes them.
There is no notification layer, no shipper device to notify, and no rule yet
about how often a shipper may be told the same thing.

That last part is not a detail: a shipper pinged for every fifteen-minute
coverage gap on a northern corridor stops reading the pings, and then the alert
that matters is one of forty they ignored that day. The thresholds here are set
wide for that reason and the alerting rule needs to be as considered as they
were.

### F4 — Proof of delivery

Photographs, signature, geotag, timestamp, and a PDF generated on a device that
has been offline for the whole trip. Roadmap phase 4.

### F5 — Waybill OCR

Roadmap phase 6. Needs an accuracy gate before it ships: an OCR figure
presented as read rather than as guessed is the same class of error as an
interpolated position.

---

## Blocked on a decision

### F6 — Multi-drop and multi-leg chaining

The trip state machine is single-origin, single-destination. A three-city
chain (A→B→C→A) is the natural extension of return-load matching and it changes
the state machine, which is the one part of this that must not be changed
casually.

Roadmap phase 7. Wants an ADR before any code.

### F7 — Broker accounts

The product statement is explicit that brokers are not to be eliminated. What
a broker account actually *is* — an agent acting for a shipper, a shipper in
their own right, or a distinct third role — has not been decided, and the
matching engine's shape depends on the answer.
