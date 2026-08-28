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

### F3 — Stall and deviation alerts · *transport only*

**The rule and the loop are both built.** `alerts.ts` decides who is told what
and how often, parity-tested on both sides; `AlertDispatcher` runs it every
five minutes, honours `repeatAfterMs` against a stored record of what actually
went out, and holds a push inside the reader's own quiet hours rather than
dropping it. The device registry carries the phone's UTC offset, because a loop
running at three in the morning has no client to ask what hour it is where the
person is.

What is left is **transport, and it is credentials rather than code**:

- `IPushSender` has one implementation, `LoggingPushSender`, which writes the
  notification to the log and says on every line that it did not send. Same
  seam and same reason as `ISmsSender`. APNs wants a signed JWT and a p8 key
  from an Apple developer account; FCM wants a service-account JSON.
- The app has a token source and registers whatever it produces — on sign-in,
  not when somebody opens a settings screen — and withdraws it on sign-out,
  because a phone in this market is handed between two drivers on alternate
  weeks. `native/push.ts` is the seam. Absent a linked provider it answers
  "unavailable", **and the app never registers a placeholder**: a `Devices` row
  with an invented token is a promise the platform cannot keep, and it fails in
  the worst direction — the dispatcher records the alert as sent,
  `repeatAfterMs` suppresses the retry, and the shipper is never told about the
  stall. See ADR-0013.

So: nothing reaches a phone yet, every piece between the condition and the
gateway is built and tested, and **the app says so on the alerts screen** —
which used to describe which alerts would wake somebody, on an install that had
never registered for notifications at all.

### F4 — Proof of delivery

Photographs, signature, geotag, timestamp, and a PDF generated on a device that
has been offline for the whole trip. Roadmap phase 4.

### F5 — Waybill OCR

Roadmap phase 6. Needs an accuracy gate before it ships: an OCR figure
presented as read rather than as guessed is the same class of error as an
interpolated position.

---

## Small, and known

### F8 — Android on real hardware

The app builds for Android and runs on an emulator, which is exactly as far as
an emulator gets you. The definition of done requires a **physical Transsion
handset** — a Tecno or an Infinix — because the risks that matter there are
OEM battery management killing a foreground service and a 2 GB device running
out of memory mid-trip, and neither reproduces on a simulated Pixel.

Nothing in phase 1's exit gate can be signed off without one.

### F9 — `compileSdk` is pinned behind React Native's default

RN 0.87 generates `compileSdkVersion = 37`. Build-tools 37 is published; the
platform `android-37` is not, so the build dies with "Failed to find target
with hash string 'android-37'" — which reads like a broken SDK install rather
than a platform that does not exist yet.

Compiled against 36 instead. Nothing here needs an API only 37 has. Revisit
when android-37 reaches the stable channel.

---

## Blocked on a decision

### F10 — A shipper ladder

`search.ts` can filter the load board by the shipper's standing, and the route
for it is served — but nothing has a standing, because there is no ladder for a
shipper to climb.

`trust.ts` is **carrier-shaped**: a driver's licence, goods-in-transit cover,
completed trips, punctuality. None of that is what makes a shipper worth
working for. That is whether they pay, and whether they pay on time — a
different set of requirements, off different evidence, and nobody has decided
what it is.

Until then `LoadSummary.shipperTier` is null and a tier filter matches nothing.
That is the truthful answer. It was previously the literal string `"verified"`,
filled in from two places in the API, each under a comment saying the real
thing was one line away. It was not one line away; it was this decision.

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
