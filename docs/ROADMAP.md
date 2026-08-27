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

**Built so far:** the queue policy and the upload loop, both pure and tested;
the TurboModule contract (`apps/mobile/src/native/NativeTracking.ts`).
**Not built:** the two native implementations behind that contract.

Everything else in this product is ordinary application development. If this
does not work, nothing else matters, and it is far better to find that out in
week 10 than in week 30.

---

## Phase 2 — Trips and the wedge

Geofencing and waypoint arrival, standalone tracking with SMS invite links,
scoped and revocable share links, the shipper map with position age and trail,
stop detection, ETA ranges on screen, trip search, and a message thread
attached to the trip.

Carries features **1–5** of the fifteen. All five engines are written and
tested; none has a screen yet.

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

**Blocked on auth**, which has no phase of its own and needs one: the ingest
endpoint currently accepts a batch from anybody who knows a trip id.

---

## Phase 3 — Identity and trust

Verification tiers, document capture, liveness and ID match, expiry tracking,
post-trip reviews, incident reporting.

Carries features **6–9**. A review here is a set of facts each side answers yes
or no to, never a star average — see the reasoning at the top of
`packages/domain/src/ratings.ts`.

**Exit gate:** tier gates enforced server-side and proven unbypassable from a
modified client.

---

## Phase 4 — Proof of delivery

Loading and delivery capture, exceptions, offline queueing, the POD document.

Carries features **10–12**.

**Exit gate:** a complete proof-of-delivery document generated on a device that
has been offline for the entire trip.

---

## Phase 5 — Marketplace and matching

Load posting, bidding, award and assignment, proactive return-load alerts,
reverse discovery, fleet utilisation reporting.

Carries features **13–15**. The ranking, filtering and chaining engines are
written and tested (`matching.ts`, `search.ts`, `chaining.ts`); phase 5 builds
what surrounds them.

**Exit gate:** match query under 2 s; first return load matched and completed
end to end.

---

## Phase 6 — Hardening and launch

Device matrix including Transsion handsets, battery and data budgets enforced
in CI, deviation alerts, waybill OCR, Hausa driver localisation, web shipper
console, staged rollout.

Shareable tracking links moved out of this phase and into phase 2, where the
wedge needs them.

**v1.0 ships to both stores.**

---

## Phase 7 — Depth · v1.1

Multi-drop loads, rate bands from corridor history,
insurance partner integration, broker tooling, fleet accounting exports.

Several of these are in `docs/FEATURE-BACKLOG.md` with the reason they are
deferred and what would unblock them.
