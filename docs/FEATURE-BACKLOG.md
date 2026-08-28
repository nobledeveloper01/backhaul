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

### F4 — Proof of delivery · *a rendered file*

Photographs, signature, geotag and timestamp are captured, saved and
**sealed** — the screen offers the one-way door and the server records it,
which is what the earnings statement and the escrow milestone both hang off.

**The hand-over is built.** `documentText()` composes `document()`'s lines into
one block of plain text and the proof screen puts it through React Native's own
`Share`, so the note leaves the phone by WhatsApp, SMS, email or a note app —
whatever that handset already has. Three things decided it:

- **Text is the format every app on a 2 GB Transsion already receives.** A PDF
  renderer is a native dependency on a device where every megabyte of install
  is a real cost, for a document that is nine label-and-value lines.
- **It works offline**, because it is composed on the device from what the
  device holds. That was the hard requirement, and it was never the file
  format that made it hard.
- **Only once sealed.** `sealedAt !== null` on the server view gates the
  action. An unsealed delivery is still editable — a photograph can go, a name
  can be rewritten — so a note handed over from one is a draft that reads like
  a record, and the receiver cannot tell the difference from the outside. The
  seal is now a line on the note itself for the same reason.

What is left is a *rendered file*: a PDF with the signature strokes and the
photographs in it, for the disputes that go past what text can carry. It is a
smaller and later problem than it looked, because `pod.ts` is already the one
place the lines are composed and a renderer would consume the same
`PodLine[]`. Roadmap phase 4.

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

### F11 — Three routes the app can read but not write · *closed*

Found by `make wired-check`, which fails when a client method has no caller.
All three were the same shape: a screen that shows a thing and cannot act on
it. All three are now wired, and the `wired-check:` reasons that stood in for
them are gone from `client.ts`.

- **`issueShare`** — the share screen lists a trip's links and revokes them,
  and had no way to create one. A shipper could turn sharing off and never on.
  It now issues one, and the screen is built around the fact that the token
  comes back **once**: the server keeps a hash, so the token is held in
  component state, shown in a card that says it will not be shown again, and
  never written to the list. Dismissing it is a one-way door, and making
  another link is the only way back — which is the truth rather than a
  limitation of the screen. The link is issued only once the server has
  answered; a link drawn optimistically is one a shipper texts to a cargo
  owner before it exists.
- **`markRead`** — a thread was read and never marked read, so the unread count
  was whatever it was when the message arrived. The receipt now goes when the
  thread is on screen — once the messages themselves have loaded, not when the
  component mounts, because clearing everyone's badge on a phone that could not
  fetch the thread means the message has been seen by nobody. A failed receipt
  says so beside a retry rather than passing silently.
- **`resolveIncident`** — an incident could be reported and never closed. It sat
  open on the trip for ever, `observe()` treats an open incident as a trip that
  needs a look, and a blocking one suppresses the arrival estimate — so a
  breakdown fixed at noon kept the trip flagged and the ETA off the screen for
  the rest of the run. The "reported" card on the trip screen closes it.

All three act only against a server: the walkthrough has none, so the share
screen says why it cannot make a real link rather than offering a button that
does nothing, and the incident card offers no close.

`sealDelivery` was a fourth until the same check found it. That one was not a
missing affordance — the proof screen showed "signed for" from a *local*
readiness check while the server's delivery was never sealed, and nothing
downstream of a sealed proof could fire: the earnings statement skips a
delivered trip with no sealed proof, and the escrow milestone never releases.

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

### F12 — The wedge is not built · **the largest gap in the product**

`CLAUDE.md` opens with the sentence that decides most arguments here:

> **Tracking is the wedge; matching is the business.**

`docs/ROADMAP.md` carries it as feature 2 of phase 2 — *"standalone tracking of
a trip arranged elsewhere — **the wedge**"* — and it is the feature that is
supposed to be worth paying for with one truck and no other user on the
platform. A shipper agrees a load on WhatsApp, as almost every load in Nigeria
is agreed, and tracks it here.

**The app cannot open a trip.** `POST /v1/trips/{id}` is served, tested, and
authorised. `ApiClient.openTrip` is written against it. No screen calls it, and
until now the `wired-check:` comment above it said *"the app never creates a
trip. A shipper writes one down elsewhere; this face tracks it."* That is the
gap restated as though it were a decision. Every trip in the product today
arrives by the marketplace route — post a load, take a bid — which is the half
the product statement says is worth nothing until there is liquidity.

**What actually blocks it, and it is not a screen.** `OpenTripRequest` takes
three party GUIDs: `DriverId`, `CarrierId`, `ShipperId`. A shipper opening a
trip has their own id and, for the other two, a phone number — the number they
have been messaging all morning. There is no way to turn one into the other.
`IdentityController` has no lookup and `AuthController` resolves a phone only
for the caller's own sign-in.

**The shape of the answer is already in the repository.** `SignInRepository`
resolves-or-creates an account from a phone number, which is exactly what
opening a trip against a driver who has never installed the app needs, and the
roadmap already says phase 2 carries *"standalone tracking with SMS invite
links"* — the invite is how that driver finds out. So the endpoint would take
phone numbers rather than GUIDs and mint the parties as it goes.

**Why that needs an ADR before any code.** An endpoint that turns any phone
number into a user identity is an enumeration oracle, and this one would be
callable by any signed-in account. It also creates accounts for people who have
not asked for one, which is defensible for a driver who is about to be invited
to a trip and indefensible as a general capability. Rate limiting alone does
not settle it — ADR-0010 reached for that on the share route, where the caller
already holds a 32-byte secret and this caller holds nothing but a guess.

Neither is a reason not to build it. They are the reason to decide it on
purpose rather than discover it in a screen.

Wants: an ADR on identity-by-phone, then the endpoint, then the screen, then
the SMS invite. Phase 2's software gate is not honestly green without it.
