# Backhaul — Product Statement

**Truck load matching and freight visibility for Nigerian road logistics.**

---

## The Problem

A 30-tonne truck leaves Lagos loaded with cement and arrives in Kano three days later. It
unloads. Then, very often, it drives 1,000 km back to Lagos **empty**.

That empty return is the single largest source of waste in Nigerian road freight. The fuel is
burned, the driver is paid, the tyres wear, the truck depreciates — and no revenue is earned
against any of it. The cost does not vanish; it is priced into the outbound leg, which is why
Nigerian freight rates are high relative to distance.

The waste persists because of four compounding failures:

**1. Matching happens through personal networks.** A truck owner in Kano finds a return load by
calling people. If nobody in their phone has cargo going south this week, the truck goes back
empty. The load might exist — it usually does — but the two parties have no way to find each
other.

**2. Neither side can verify the other.** A cargo owner handing ₦8m of goods to a stranger with
a truck is taking a serious risk, and has no way to assess it. A truck owner accepting a job
from an unknown shipper has no way to know they will be paid. Both sides retreat to people they
already know, which is precisely what keeps the market fragmented.

**3. Cargo disappears for three days.** Once a truck leaves, the cargo owner has no visibility.
Where is it? Is it moving? Is it stuck at a checkpoint? Has it been diverted? The answer is a
phone call to a driver who may or may not answer, and who has an incentive not to report a
delay.

**4. Proof of delivery is a signature on paper.** Disputes about whether goods arrived, in what
condition, and when, are settled by argument. There is no timestamped, geotagged, photographed
record.

---

## Why Existing Solutions Do Not Work

**WhatsApp broker groups** are the incumbent, and their existence proves the demand. They are
also unsearchable, geographically arbitrary, full of brokers-of-brokers each taking a cut, and
they carry no verification, no tracking and no record.

**Global freight platforms** assume a road network, an insurance market, a payment
infrastructure and a legal enforcement environment that do not map onto this market. They also
assume drivers with unlimited data plans and phones that stay charged.

**Traditional haulage companies** solve the problem inside their own fleet, which is why they
run at better utilisation. But they cover a small fraction of the market; the majority of
Nigerian trucking is owner-operators and small fleets of two to ten vehicles.

**Existing local platforms** have mostly focused on the shipper side — booking a truck — and
treated the return leg as somebody else's problem. The return leg is where the money is.

---

## The Product

Backhaul is a two-sided freight platform with tracking as its spine.

1. **Post** — a cargo owner posts a load: what, how much, from where, to where, by when.
2. **Bid** — verified truck owners and drivers bid. The cargo owner sees each bidder's
   verification tier, completed trips, and rating.
3. **Track** — once assigned, the cargo owner watches the truck move in near-real time, with
   checkpoint logging and ETA updates that survive long stretches with no signal.
4. **Prove** — delivery is captured as photographs plus a signature plus a geotag plus a
   timestamp, and that record is immutable and available to both parties.
5. **Return** — and this is the actual product: as a truck approaches its destination, Backhaul
   surfaces loads going back the other way, matched on corridor, timing and vehicle type.

---

## The Insight

**Tracking is the wedge; matching is the business.**

A marketplace with no liquidity is worth nothing to either side. But **tracking is valuable to
a single cargo owner with a single truck on a single trip**, with no other user on the
platform. It solves an acute, present anxiety: *where are my goods right now?*

So Backhaul enters as a visibility tool for shipments the user has already arranged, through
whatever channel they already use. Every tracked trip teaches the platform a corridor, a truck,
a driver, a shipper, and a timing pattern. Liquidity accumulates as a by-product of a feature
that was already worth using alone.

By the time the return-load matching switches on, the platform knows which trucks are heading
which way and when — which is exactly the data the matching engine needs and exactly the data a
cold-start marketplace does not have.

---

## Target User

**Primary — the small fleet owner.** Two to ten trucks. Runs the business from a phone.
Currently finds loads through a broker network and accepts empty returns as a cost of doing
business. Motivated almost entirely by utilisation: an extra loaded return leg per truck per
month is a material change to their income.

**Secondary — the cargo owner / shipper.** A manufacturer, distributor, trader or agricultural
aggregator moving goods between cities. Motivated by visibility and by price transparency;
currently pays whatever the broker quotes.

**Tertiary — the driver.** Employed by the fleet owner. Uses the app all day, on the road, on a
phone that must survive a three-day trip. The most demanding technical user in the product and
the one with the least motivation to cooperate with software — so the driver app must be
almost invisible: it runs, it reports, and it asks for nearly nothing.

**Quaternary — the broker.** Backhaul does not attempt to eliminate brokers. Good brokers
aggregate demand and absorb risk, which is real work. The platform makes their pricing visible
and gives them better tools; it does not pretend they can be abolished.

---

## Why Now

- **Smartphone penetration among drivers crossed the threshold.** Five years ago the driver
  side was not buildable.
- **Background location on Android is finally workable** with foreground services and modern
  battery APIs — with real caveats around OEM behaviour, which the architecture accounts for.
- **Fuel cost made empty running unignorable.** Subsidy removal turned a tolerated inefficiency
  into an existential one for small fleet owners.
- **Cargo theft and diversion concerns have made tracking a purchasing criterion**, not a
  nice-to-have, for anyone moving high-value goods.

---

## Explicitly Not

- **Not a freight forwarder.** Backhaul does not take custody of goods, does not contract for
  carriage, and is not the carrier of record. It is a matching and visibility platform.
- **Not a payments or escrow business.** Parties settle directly. Holding freight payments
  would make this a regulated financial business and would import a very large risk surface for
  no strategic gain.
- **Not an insurer.** Backhaul surfaces whether a carrier holds goods-in-transit cover and
  verifies the document. It does not underwrite.
- **Not a fleet-management telematics product.** No engine diagnostics, no fuel-sensor
  integration, no driver-behaviour scoring in v1. Those are hardware businesses.
- **Not a broker-elimination crusade.** See above.
