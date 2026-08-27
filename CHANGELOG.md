# Changelog

Everything here is what changed for someone *using* Backhaul. Internal
refactors that nobody outside can observe do not appear.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Trip lifecycle.** A trip moves through an explicit set of states — open,
  assigned, loading, in transit, arrived, delivered — with signal loss and
  stalls tracked as first-class states rather than gaps. Its history is
  append-only, so a delivery dispute is argued against a record neither party
  can edit.
- **Position cleaning.** Fixes the phone itself cannot vouch for are excluded
  from distance figures, and what was excluded is shown rather than discarded.
  A track that lost half its fixes reports that alongside the distance.
- **Adaptive tracking policy.** Sampling slows when the truck is stopped and
  slows further when the battery is low, because a driver whose phone dies is a
  trip with no evidence at all. The reason is shown on the driver's screen.
- **Stall and silence detection.** Twenty minutes without a fix is reported as
  no signal; forty-five minutes stationary away from a scheduled stop is
  reported as a stall. A truck parked at the depot it was told to load at is
  neither.
- **Indicative pricing.** A range, never a single figure, for what a truck
  costs over a road — marked indicative everywhere it appears.
- **Demurrage and settlement.** Four free hours at each end, then charged by
  the hour with part-hours rounded up. Commission is taken on the fare and
  never on demurrage.
- **ETA ranges.** An arrival window built from the trip's own pace, or from the
  truck class when there is not yet enough of a track — marked as an estimate
  when it is one, and refused with a reason when the evidence is too thin.
- **Return-load matching.** Available loads ranked for a carrier by what they
  pay, how far the truck runs empty to reach them, and how much of the run home
  they cover. Loads the truck cannot take are shown greyed with the reason
  rather than hidden.
- **An app.** Three faces in one binary: a shipper's trip list and trip screen,
  a carrier's ranked return loads, and a driver screen that is one screen with
  one action. Light and dark, with a switcher; light by default.
- **A corridor view.** Where the truck is along its route, drawn to scale, with
  the stretches that had no signal marked in the position they happened.
- **An API client in the app**, with a sealed result rather than exceptions: a
  driver offline for hours is a normal condition, not an error path, and a
  failed upload says so plainly so the phone keeps its rows.
- **An API.** Trips can be opened and moved through their lifecycle, positions
  submitted in batches, a cleaned track read back, and indicative prices and
  settlement statements requested. Documented at `/swagger`, generated from the
  code rather than written beside it.
- **Bid ranking.** Offers ranked for a shipper on price, record and proximity,
  with the record shown beside the price so the shipper can overrule the order.
  A new carrier ranks as unknown, not as bad.

### Security

- **Every endpoint except `/healthz` now needs a bearer token**, and a trip is
  visible only to its driver, its carrier and its shipper. Anyone else is told
  it does not exist rather than that they may not see it — the existence of a
  trip id is itself information.
- **Only a trip's driver can add positions to it.** A carrier watching the
  truck and a shipper watching their goods can both read the track; neither can
  write to it, because a position history a second party can append to is not
  evidence of anything.
- Tokens are stored as a SHA-256 hash. The value itself exists once, when it is
  issued, and is never shown again.

### Changed

- The appearance choice now survives a restart.
- The app builds and runs on Android.

### Fixed

- The driver screen offered "signal lost" and "stalled" as buttons. Both are
  observations the tracker raises; offering them asked a driver to self-report
  the thing the tracking exists to detect.
- A trip's history attributed a lost signal to the driver rather than the
  system.
- Indicative price ranges were quoted to the naira — "₦1,861,487 – ₦2,678,725"
  — which is arithmetic pretending to be a quote. They now round to ₦5,000.
- At the largest accessibility text size the tab bar's labels wrapped into each
  other and ran off the screen, and the headline filled the display.
- "Recording starts when you begin loading" was shown on trips that had already
  arrived.
- On screens without a header, content scrolled under the status bar with
  nothing behind it, printing the summary line through the clock.

### Notes

- The API has **no authentication yet**. Anyone who knows a trip id can post
  positions to it. It is not exposed anywhere and must not be until phase 3.
- The API defaults to an **in-memory store**, which loses everything on
  restart. `/healthz` reports which store is in use and whether it is durable.
