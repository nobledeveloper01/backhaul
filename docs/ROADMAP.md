# Roadmap

Where the work is, and what finishes each phase. `PHASE` at the repository root
holds the current number.

A phase is done when its exit gate is green — not when the code is written.
Gates are written before the phase starts and are not softened to fit what got
built.

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

Geofencing, standalone tracking with SMS invite links, the shipper map with
position age and trail, stop detection, ETA ranges on screen.

**Exit gate:** a shipper tracks a real truck on a real corridor, end to end, on
both platforms. First external pilot users onboard here — before any
marketplace exists.

**Blocked on auth**, which has no phase of its own and needs one: the ingest
endpoint currently accepts a batch from anybody who knows a trip id.

---

## Phase 3 — Identity and trust

Verification tiers, document capture, liveness and ID match, expiry tracking,
ratings, incident reporting.

**Exit gate:** tier gates enforced server-side and proven unbypassable from a
modified client.

---

## Phase 4 — Proof of delivery

Loading and delivery capture, exceptions, offline queueing, the POD document.

**Exit gate:** a complete proof-of-delivery document generated on a device that
has been offline for the entire trip.

---

## Phase 5 — Marketplace and matching

Load posting, bidding, award and assignment, proactive return-load alerts,
reverse discovery, fleet utilisation reporting.

The ranking engines are written and tested (`packages/domain/src/matching.ts`).
Phase 5 builds what surrounds them.

**Exit gate:** match query under 2 s; first return load matched and completed
end to end.

---

## Phase 6 — Hardening and launch

Device matrix including Transsion handsets, battery and data budgets enforced
in CI, deviation alerts, waybill OCR, shareable tracking links, Hausa driver
localisation, web shipper console, staged rollout.

**v1.0 ships to both stores.**

---

## Phase 7 — Depth · v1.1

Multi-drop loads, multi-leg chaining, rate bands from corridor history,
insurance partner integration, broker tooling, fleet accounting exports.

Several of these are in `docs/FEATURE-BACKLOG.md` with the reason they are
deferred and what would unblock them.
