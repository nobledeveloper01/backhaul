# Roadmap

Where the work is, and what finishes each phase. `PHASE` at the repository root
holds the current number.

A phase is done when its exit gate is green — not when the code is written.
Gates are written before the phase starts and are not softened to fit what got
built.

---

## The next fifteen, and where each one lands

Fifteen features were specified together and then **deliberately scattered
across four phases**, because the alternative — building all fifteen now — is
how a product ends up with fifteen half-surfaces and no working trip.

Each one's engine is written and tested in `packages/domain` before its screen
exists. The engines are pure arithmetic: they need no device, no network and no
phase gate, and settling them first is what keeps the app layer thin. A feature
is only *shipped* when its phase's exit gate is green.

| # | Feature | Phase | Engine |
|---|---|---|---|
| 1 | Shareable tracking link, with scope, expiry and revocation | 2 | `sharing.ts` |
| 2 | Standalone tracking of a trip arranged elsewhere — **the wedge** | 2 | `sharing.ts`, `trip.ts` |
| 3 | Trip search and filter | 2 | `search.ts` |
| 4 | Waypoints and geofenced arrival | 2 | `waypoints.ts` |
| 5 | Messages between the three parties, attached to the trip | 2 | `messages.ts` |
| 6 | Verification tiers | 3 | `trust.ts` |
| 7 | Document capture with expiry warnings | 3 | `trust.ts` |
| 8 | Post-trip reviews — facts, not stars | 3 | `ratings.ts` |
| 9 | Incident reporting from the road | 3 | `incidents.ts` |
| 10 | Proof-of-delivery capture: photos, signature, geotag | 4 | `pod.ts` |
| 11 | The delivery document | 4 | `pod.ts` |
| 12 | Delivery exceptions — short, damaged, refused | 4 | `pod.ts` |
| 13 | Load board search with filters | 5 | `search.ts` |
| 14 | Reverse discovery — a truck advertising where it will be empty | 5 | `matching.ts`, `utilisation.ts` |
| 15 | Multi-leg chaining | 5 | `chaining.ts` |

Three of these were previously parked in phases 6 and 7 — shareable links,
reverse discovery and multi-leg chaining. They moved forward because their
engines turned out to be small and because each one is load-bearing for the
phase it moved into: a wedge with no shareable link has nobody to show the
truck to, and a return-load market with no chaining is a market that solves
one empty leg out of two.

**What did not move.** Waybill OCR, insurance integration, rate bands from
corridor history and the web shipper console stay where they are. Each needs
something this codebase does not have yet — a corpus of real trips, a partner,
or a second platform — and pulling them forward would mean building them
against guesses.

---

## The fifteen after that

A second set, specified and split the same way — and for the same reason. The
first fifteen widened the product; these deepen it, and most of them exist
because of something the first fifteen made visible.

| # | Feature | Phase | Engine |
|---|---|---|---|
| 16 | Route deviation — a truck moving *away* from where it is going | 2 | `deviation.ts` |
| 17 | Alert policy: who is told what, and never at 3am | 2 | `alerts.ts` |
| 18 | What the tracking costs a driver in data | 2 | `budget.ts` |
| 19 | Vehicle registry with roadworthiness and insurance expiry | 3 | `vehicles.ts` |
| 20 | Duress alarm — silent, and it stays silent | 3 | `duress.ts` |
| 21 | Cancellation and no-show terms | 3 | `cancellation.ts` |
| 22 | Dispute pack assembly | 4 | `dispute.ts` |
| 23 | Multi-drop loads | 4 | `drops.ts` |
| 24 | The checkpoint ledger — what the road actually takes | 4 | `levies.ts` |
| 25 | Payment milestones with verifiable conditions | 5 | `escrow.ts` |
| 26 | Carrier cost model: diesel, running, levies, margin | 5 | `costs.ts` |
| 27 | Part-load consolidation | 5 | `consolidation.ts` |
| 28 | Hausa for the driver face | 6 | `language.ts` |
| 29 | Driver earnings statement | 6 | `earnings.ts` |
| 30 | Recurring lanes | 6 | `lanes.ts` |

Two moved forward out of phase 7: **multi-drop** and **rate history**, the
latter arriving as `lanes.ts` — a lane's own median price, which is the version
of corridor rate bands that does not need a corpus to be useful.

**What the writing of these changed.** Three of them contradicted the obvious
design, and the contradiction is the feature:

- **Deviation is not cross-track distance.** The straight line from Lagos to
  Kano runs through farmland; the road is up to 90 km off it for hours. A
  cross-track alarm fires on every correct trip. `deviation.ts` measures
  *progress* instead — a truck getting further from its destination, for long
  enough, while moving.
- **The data cost turned out to be negligible.** A day of tracking is about
  fifteen kobo. Writing `budget.ts` is what established that battery, not data,
  is the price a driver pays — which is where `tracking.ts` was already
  spending its care.
- **A duress alarm's success state is nothing at all.** No toast, no changed
  screen, no sound. `visibleConfirmation()` returns `null` and is tested,
  because the person standing over the driver must not be able to tell.

---

## What the server actually serves

The domain has 35 engines. The API has routes for some of them, and the gap is
the honest answer to "how far along is this".

| Served, with parity where a rule is shared | Engine only — no route yet |
|---|---|
| trips, tracking, pricing | search, lanes, ratings |
| share links (ADR-0010) | alerts |
| sign-in (`otp`) | budget *(on-device by design)* |
| messages, incidents, waypoints | language *(client-side by design)* |
| proof of delivery, drops, levies | |
| verification, vehicles, duress | |
| escrow, cancellation, costs, earnings | |
| matching, chaining, consolidation | |
| **dispute assembly, deviation** | |

Everything in the right-hand column has a tested engine and a screen; what it
does not have is a place to put the answer. The app renders those from
`state/demo.ts`, which is why signing in is real and what it unlocks is still
a walkthrough.

**The rule for closing that gap** is the one ADR-0005 already sets: a rule that
exists on both sides gets a parity case before it gets an endpoint. Twenty-four
of them do now — the trip machine, pricing, demurrage, settlement, fix
cleaning, stall detection, sign-in wording, waypoint visits, incident severity,
delivery sealing, drop fees, the trust ladder, vehicle standing, the escrow
schedule, cancellation fees and their wording, the cost model, driver
statements, the load ranking, the bid
ranking, chain fits, load pairing, the dispute
pack and course deviation.

`budget.ts` has no route and should not have one: it answers "what is this
tracking costing me in data", which is a question about the phone in the
driver's hand. The server does not know their tariff and has no business
guessing at it.

One thing the money routes needed that no engine could supply: **a trip's
commercial terms**. A trip had a driver, a carrier, a shipper and a corridor,
and nothing about what it was worth — so `TripTermsEntity` is a new table, and
it is optional on purpose. A trip that is tracked and not traded is the wedge
working as intended, and every money route answers that case with a sentence
rather than a schedule of zeroes.

---

## Phase 0 — Foundation · **complete**

Monorepo, the pure domain package and the lint boundary that keeps it pure, RN
New Architecture, navigation, design tokens, `op-sqlite`, CI producing signed
artefacts for both platforms.

**Exit gate**

| | |
|---|---|
| Both platforms building in CI | **green** — iOS and Android, on every push |
| `packages/domain` importable by a non-RN consumer, proving the boundary holds | **green** — the package builds to plain ESM and its tests run under Node with no RN present |
| Boundary rule proven to fire | **green** — `scripts/boundary-check.sh` |
| Documentation gate running in CI | **green** — `scripts/doc-check.sh` |
| The server builds, and agrees with the domain | **green** — 106 parity cases and 16 endpoint tests |
| Parity staleness gate proven to fire | **green** — `make fixtures-check` |
| Every endpoint behind a token, visibility filtered at the query layer | **green** — ADR-0008 |

Domain engines for later phases are being written now, ahead of their app
surfaces. That is deliberate: they are pure arithmetic, they need no device,
and settling them first is what makes the app layer thin. The trip state
machine belongs to phase 2 and the matching engine to phase 5; both are done
and tested, and neither has a screen.

The API is further along than phase 0 needs for the same reason: trips,
ingest, tracks and pricing are all served, verified against real PostgreSQL,
and proven to survive a process restart. What it does *not* have is auth,
which gates it from being useful to anyone outside this machine.

---

## Phase 1 — The tracking engine · **current, and the long pole**

Built first and built alone: Android foreground service, iOS background
location and region monitoring, the native SQLite queue, batched upload with
acknowledgement, restart and boot recovery, OEM mitigation.

The policy those loops follow is already written and tested
(`packages/domain/src/tracking.ts`). What phase 1 builds is the loop.

**Exit gate — all three are hard**

| | |
|---|---|
| 1. **Zero position loss** across a simulated 1,000 km airplane-mode trip, verified for order and for duplicates | **green in software** — `packages/domain/test/queue.test.ts`, and re-checked against the native queue in `apps/mobile/__tests__/tracker.test.ts`. See ADR-0009 |
| 2. **Under 4% battery per hour**, screen off, on real hardware, both platforms | blocked on a device |
| 3. **72-hour soak survival** on physical devices including Tecno and Infinix | blocked on a device |

Gate 1 is about correctness and is met. Gates 2 and 3 are about a handset and
no simulation stands in for either — the risk they exist to catch is OEM
battery management killing a foreground service, which only happens on the
device it happens on.

**Built:** the queue policy and the upload loop, both pure and tested; the
TurboModule contract; and — as of this session — **both native
implementations**, in `packages/tracking-native`. An Android foreground service
with a SQLite queue, a boot receiver and OEM-restriction reporting; iOS
background location with the same queue and the same contract. Both compile,
both link through autolinking, and both are driven by the same policy in
`@backhaul/domain`.

**Not proven:** neither has run on a physical handset, which is exactly what
gates 2 and 3 are about.

Everything else in this product is ordinary application development. If this
does not work, nothing else matters, and it is far better to find that out in
week 10 than in week 30.

---

## Phase 2 — Trips and the wedge

Geofencing and waypoint arrival, standalone tracking with SMS invite links,
scoped and revocable share links, the shipper map with position age and trail,
stop detection, ETA ranges on screen, trip search, and a message thread
attached to the trip.

Carries features **1–5** and **16–18**. All eight engines are written and
tested.

**Exit gate:** a shipper tracks a real truck on a real corridor, end to end, on
both platforms, **and the public share route is rate limited** — *green in
software*: sixty an hour per address, partitioned so one abusive caller cannot
take the feature away from everybody else, and proven to fire by
`ShareRateLimitTests`. First external pilot users onboard here — before any
marketplace exists.

The rate limit is on the gate rather than in the backlog because
`GET /v1/share/{token}` is the only route in the product that answers an
unauthenticated request with a truck's position. Guessing a 32-byte token is
not a threat; hammering the endpoint is. See
[ADR-0010](adr/0010-a-share-link-is-a-capability-and-its-endpoint-is-public.md).

**No longer blocked on auth.** Phone-plus-code sign-in is built —
`packages/domain/src/otp.ts` for the policy, `/v1/auth/request` and
`/v1/auth/verify` for the endpoints, and the app is gated behind it.

**The SMS gateway is no longer a contract either.** `HttpSmsSender` talks to a
gateway we host: `android-sms-gateway` (Apache-2.0), whose server half is a
container in `server/compose.yaml` and whose sending half is a spare Android
phone with a Nigerian SIM. No aggregator account, no per-message billing
negotiation before the pilot sends its first code, and the codes arrive from an
ordinary mobile number rather than a shortcode — which matters, because an
unfamiliar shortcode reads as a scam here.

What it is **not** is free SMS. Every message comes off that SIM's bundle. At
one sign-in code per driver per ninety days that is small; at marketing volume
it is the wrong architecture, and an aggregator is what that needs. The request
shape is configuration rather than code, so swapping to one is a config edit.

---

## Phase 3 — Identity and trust

Verification tiers, document capture, liveness and ID match, expiry tracking,
post-trip reviews, incident reporting.

Carries features **6–9** and **19–21**. A review here is a set of facts each
side answers yes or no to, never a star average — see the reasoning at the top
of `packages/domain/src/ratings.ts`.

The duress alarm (**20**) belongs to this phase because it depends on knowing
who a driver's carrier actually is, which is what verification establishes. It
is the one feature in the product whose correctness is measured by what the
screen does *not* do.

**Exit gate:** tier gates enforced server-side and proven unbypassable from a
modified client.

---

## Phase 4 — Proof of delivery

Loading and delivery capture, exceptions, offline queueing, the POD document.

Carries features **10–12** and **22–24**. The dispute pack (**22**) is what
every careful decision so far was for: the append-only history, the discarded
fixes, the message written in a dead zone, the geotagged photograph. It adds
nothing and decides nothing — a platform that adjudicates its own disputes is
one both sides stop trusting.

**Exit gate:** a complete proof-of-delivery document generated on a device that
has been offline for the entire trip.

---

## Phase 5 — Marketplace and matching

Load posting, bidding, award and assignment, proactive return-load alerts,
reverse discovery, fleet utilisation reporting.

Carries features **13–15** and **25–27**. The ranking, filtering, chaining,
escrow, cost and consolidation engines are all written and tested; phase 5
builds what surrounds them.

`costs.ts` is the one that checks the rest: a test asserts that `quote()`'s own
midpoint leaves a carrier a real margin on a Lagos–Kano round trip **after** a
full empty return leg. If the pricing engine ever prices below what the road
costs, that test fails rather than a haulier finding out.

**Exit gate:** match query under 2 s; first return load matched and completed
end to end.

---

## Phase 6 — Hardening and launch

Device matrix including Transsion handsets, battery and data budgets enforced
in CI, deviation alerts, waybill OCR, Hausa driver localisation, web shipper
console, staged rollout.

Carries features **28–30**. Shareable tracking links moved out of this phase
and into phase 2, where the wedge needs them; Hausa, the driver's earnings
statement and recurring lanes moved *in*, because each one is about keeping
people rather than about acquiring them.

**v1.0 ships to both stores.**

---

## Phase 7 — Depth · v1.1

Rate bands from corridor history,
insurance partner integration, broker tooling, fleet accounting exports.

Several of these are in `docs/FEATURE-BACKLOG.md` with the reason they are
deferred and what would unblock them.
