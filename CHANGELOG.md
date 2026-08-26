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
- **Bid ranking.** Offers ranked for a shipper on price, record and proximity,
  with the record shown beside the price so the shipper can overrule the order.
  A new carrier ranks as unknown, not as bad.
