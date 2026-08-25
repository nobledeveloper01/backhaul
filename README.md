# Backhaul

**Truck load matching and freight visibility for Nigerian road logistics.**

A 30-tonne truck leaves Lagos loaded and arrives in Kano three days later. It unloads. Then, very
often, it drives 1,000 km back **empty**. The fuel is burned, the driver is paid, the tyres wear —
and no revenue is earned against any of it. That cost is priced into the outbound leg, which is
why Nigerian freight rates are high relative to distance.

Backhaul is a two-sided freight platform with tracking as its spine: post a load, take bids from
verified carriers, watch the cargo move, prove the delivery — and, as a truck nears its
destination, surface the loads going back the other way.

See [`docs/00-PRODUCT-STATEMENT.md`](docs/00-PRODUCT-STATEMENT.md) for the full analysis.

---

## Status

Specified, not yet built. **Second** in the portfolio build order.

## The insight

**Tracking is the wedge; matching is the business.**

A marketplace with no liquidity is worth nothing to either side. But tracking is valuable to a
single cargo owner with a single truck on a single trip, with no other user on the platform — it
answers an acute, present anxiety: *where are my goods right now?*

So Backhaul enters as a visibility tool for shipments the user already arranged through their
usual broker. Every tracked trip teaches the platform a corridor, a truck, a driver and a timing
pattern — which is precisely the data the matching engine needs and precisely the data a
cold-start freight marketplace does not have.

## Why React Native

This is the project where React Native is clearly right. The hard problems are native and this
ecosystem has already solved them: background geolocation surviving a 72-hour trip, an Android
foreground service, iOS region monitoring, vendor liveness SDKs. And the shipper wants a desktop
view of their fleet — the matching logic, ETA model, trip state machine and validation rules are
written once in TypeScript and consumed by the app, the web console and the server.

## Does it need a backend?

**Yes — the heaviest in the portfolio.** Its whole value proposition is showing person A where
person B's truck is, and matching strangers who need to trust each other. Both are irreducibly
server-side.

But the split still holds where it matters most: **the device is authoritative for capturing and
preserving a position; the server is authoritative for distributing it.** A truck driving through
400 km of dead zone loses nothing — the samples are on the phone, in order, and they arrive
complete when signal returns.

## The hardest engineering

A three-day trip. A phone that must not be drained. Hours with no signal. An Android OS that kills
background work and an iOS that never promised any. And a hard requirement: **not one position may
be lost.**

The decisive decision is that **the tracking loop does not live in JavaScript.** The JS runtime
cannot be relied upon to be alive across 72 hours on either platform, so the entire
capture-and-persist path is native: location callback → sampling policy → write to SQLite → batch
upload → delete only on server acknowledgement. JavaScript is never in the critical path.

Three release gates, all measured on real hardware: **zero position loss** across a simulated
1,000 km airplane-mode trip, **under 4% battery per hour** with the screen off, and **72-hour
survival** — including on Transsion devices, which dominate the driver segment and have the most
aggressive battery management.

## Platforms

Android 8.0+ and iOS 14+ from one codebase, plus a React web shipper console. Android's foreground
service is the stronger guarantee; iOS supplements with corridor-waypoint region monitoring to
force wake-ups, within its 20-region limit via a sliding window.
