using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Domain.Tracking;

namespace Backhaul.Domain.Market;

/// <summary>A load on the board.</summary>
public sealed record Load(
    Guid Id,
    Position Origin,
    Position Destination,
    double WeightTonnes,
    TruckClass Requires,
    Kobo? Offered,
    DateTimeOffset ReadyBy,
    DateTimeOffset ExpiresAt);

/// <summary>A truck, and where it is trying to get back to.</summary>
public sealed record Carrier(Position At, DateTimeOffset FreeFrom, TruckClass Truck, Position? Base);

public enum Blocker
{
    TooHeavy,
    WrongClass,
    Expired,
    CannotReach,
}

public sealed record LoadScore(
    Load Load,
    double Score,
    Blocker? Blocked,
    double DeadheadM,
    double ProgressHomeM,
    string Because);

/// <summary>One carrier's offer on a load.</summary>
public sealed record Bid(
    Guid Id,
    Guid CarrierId,
    Kobo Amount,
    int TripsCompleted,
    int TripsOnTime,
    Position At,
    DateTimeOffset PlacedAt);

public sealed record BidScore(Bid Bid, double Score, double? Reliability, int KmToPickup, string Because);

/// <summary>
/// Which load, and whose bid.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/matching.ts</c>. Both rankings return every
/// candidate, scored and explained, rather than a filtered shortlist — a
/// ranking that silently drops options is one the user cannot argue with, and
/// the first thing a haulier does with a recommendation is argue with it.
/// </remarks>
public static class Matching
{
    /// <summary>Deadhead beyond this is not worth scoring against.</summary>
    public static readonly double MaxDeadheadM = 400_000;

    /// <summary>Below this many completed trips, a carrier has no meaningful record.</summary>
    public static readonly int MinimumTripsForReliability = 5;

    /// <summary>
    /// How far above the cheapest bid a carrier may ask before price scores zero.
    /// </summary>
    /// <remarks>
    /// A quarter. A carrier asking 25% more than the cheapest offer had better
    /// be winning on record alone, and at that point the shipper should be
    /// looking at the two figures themselves rather than at a ranking.
    /// </remarks>
    public static readonly double PremiumTolerance = 0.25;

    /// <summary>
    /// Ranks available loads for a carrier, best first.
    /// </summary>
    /// <remarks>
    /// Blocked loads sort last regardless of score: a load that cannot be
    /// taken should never sit above one that can, however attractive it looks.
    /// </remarks>
    public static IReadOnlyList<LoadScore> RankLoads(
        Carrier carrier,
        IReadOnlyList<Load> loads,
        DateTimeOffset now) =>
        loads
            .Select(load => ScoreLoad(carrier, load, now))
            .OrderBy(s => s.Blocked is null ? 0 : 1)
            .ThenByDescending(s => s.Score)
            .ToList();

    private static LoadScore ScoreLoad(Carrier carrier, Load load, DateTimeOffset now)
    {
        var deadhead = Geo.Distance(carrier.At, load.Origin);
        var haul = Geo.Distance(load.Origin, load.Destination);

        var progressHome = carrier.Base is null
            ? 0
            : Geo.Distance(carrier.At, carrier.Base) - Geo.Distance(load.Destination, carrier.Base);

        var blocked = BlockerFor(carrier, load, deadhead, now);
        if (blocked is { } reason)
        {
            return new LoadScore(load, 0, reason, deadhead, progressHome, ExplainBlocker(reason));
        }

        // Three things decide it, and the weights say which matters:
        //
        //   value    what the trip pays against what it costs to reach
        //   homeward how much of the empty run home this load covers
        //   urgency  how soon it has to be collected
        //
        // Homeward is weighted almost as heavily as value on purpose. It is
        // the asymmetry the product is named after, and a matcher that treats
        // a return load as just another load is a load board.
        var value = ValueScore(load, haul, deadhead);
        var homeward = HomewardScore(progressHome, haul, carrier.Base is not null);
        var urgency = UrgencyScore(load, now);

        var score = Clamp(0.45 * value + 0.4 * homeward + 0.15 * urgency);

        return new LoadScore(
            load,
            score,
            null,
            deadhead,
            progressHome,
            Explain(deadhead, progressHome, carrier.Base is not null));
    }

    private static Blocker? BlockerFor(Carrier carrier, Load load, double deadhead, DateTimeOffset now)
    {
        if (load.ExpiresAt <= now) return Blocker.Expired;
        if (!Trucks.Fits(carrier.Truck, (decimal)load.WeightTonnes)) return Blocker.TooHeavy;
        if (carrier.Truck != load.Requires) return Blocker.WrongClass;
        if (deadhead > MaxDeadheadM) return Blocker.CannotReach;
        return null;
    }

    /// <summary>
    /// Paid distance against total distance.
    /// </summary>
    /// <remarks>
    /// A 500 km haul reached by 50 km of empty running is 91% productive. The
    /// same haul reached by 400 km of empty running is 56%, and no rate makes
    /// that up.
    /// </remarks>
    private static double ValueScore(Load load, double haul, double deadhead)
    {
        var total = haul + deadhead;
        if (total == 0) return 0;
        var productive = haul / total;

        var indicative = Quote.For(load.Requires, (int)haul).Mid;
        var premium = load.Offered is not { } offered || indicative.Value == 0
            ? 1
            : Clamp((double)offered.Value / indicative.Value, 0.5, 1.5);

        return Clamp(productive * premium);
    }

    /// <summary>
    /// How much of the run home this load covers, as a fraction of its length.
    /// </summary>
    /// <remarks>
    /// A load that goes exactly the right way scores 1. One that goes sideways
    /// scores 0.5 — neutral, not punished, because a paying sideways load
    /// still beats an empty truck. With no base it is a flat 0.5: a carrier
    /// who has not said where home is should not have every load marked down.
    /// </remarks>
    private static double HomewardScore(double progressHome, double haul, bool hasBase) =>
        !hasBase || haul == 0 ? 0.5 : Clamp(0.5 + progressHome / (2 * haul));

    /// <summary>Loads that must move today outrank loads that can wait a week.</summary>
    private static double UrgencyScore(Load load, DateTimeOffset now)
    {
        var hours = (load.ReadyBy - now).TotalHours;
        if (hours <= 0) return 1;
        if (hours >= 72) return 0;
        return 1 - hours / 72;
    }

    private static string Explain(double deadhead, double progressHome, bool hasBase)
    {
        var empty = $"{Round(deadhead / 1000)} km empty to the pickup";
        if (!hasBase) return $"{empty}.";
        if (progressHome > 50_000)
        {
            return $"{empty}, and it covers {Round(progressHome / 1000)} km of the run home.";
        }

        if (progressHome < -50_000)
        {
            return $"{empty}, but it takes you {Round(-progressHome / 1000)} km further from base.";
        }

        return $"{empty}; neither toward base nor away from it.";
    }

    private static string ExplainBlocker(Blocker blocked) => blocked switch
    {
        Blocker.TooHeavy => "Heavier than your truck carries.",
        Blocker.WrongClass => "The shipper asked for a different class of truck.",
        Blocker.Expired => "This load has expired.",
        Blocker.CannotReach => $"More than {MaxDeadheadM / 1000} km of empty running away.",
        _ => throw new InvalidOperationException($"unmapped blocker {blocked}"),
    };

    /// <summary>
    /// Ranks bids for a shipper.
    /// </summary>
    /// <remarks>
    /// The cheapest bid is not the best bid. A new carrier is scored as
    /// *unknown* rather than unreliable — which sits between good and bad
    /// rather than at the bottom, because a marketplace that never surfaces a
    /// new carrier never gets a second one.
    /// </remarks>
    public static IReadOnlyList<BidScore> RankBids(IReadOnlyList<Bid> bids, Position pickup)
    {
        if (bids.Count == 0) return [];

        var cheapest = bids.Min(b => b.Amount.Value);

        return bids
            .Select(bid =>
            {
                // A proportional premium over the cheapest bid, not a position
                // within the spread. Scoring by position was the first version
                // and it handed every load to the cheapest bidder: with two
                // bids of ₦1,800,000 and ₦2,000,000 the dearer scores zero on
                // price, as though it were infinitely expensive, purely
                // because it is the top of a two-bid range.
                var premium = cheapest == 0 ? 0 : (double)(bid.Amount.Value - cheapest) / cheapest;
                var price = Clamp(1 - premium / PremiumTolerance);

                double? reliability = bid.TripsCompleted >= MinimumTripsForReliability
                    ? Clamp((double)bid.TripsOnTime / bid.TripsCompleted)
                    : null;

                var kmToPickup = Geo.Distance(bid.At, pickup) / 1000.0;
                // Within 50 km is as good as at the door; beyond 300 km the
                // truck is unlikely to arrive when it says.
                var proximity = Clamp(1 - Math.Max(0, kmToPickup - 50) / 250);

                var score = Clamp(0.4 * price + 0.4 * (reliability ?? 0.6) + 0.2 * proximity);

                return new BidScore(
                    bid,
                    score,
                    reliability,
                    (int)Round(kmToPickup),
                    reliability is null
                        ? $"New to Backhaul — {bid.TripsCompleted} completed trip" +
                          $"{(bid.TripsCompleted == 1 ? "" : "s")}, no record yet."
                        : $"{Round(reliability.Value * 100)}% on time across " +
                          $"{bid.TripsCompleted} trips.");
            })
            .OrderByDescending(s => s.Score)
            .ToList();
    }

    /// <summary>
    /// JavaScript's <c>Math.round</c>: halves go up, not away from zero.
    /// </summary>
    /// <remarks>
    /// Every rounded figure here lands in a sentence the parity fixtures
    /// assert character for character, and .NET's default disagrees with
    /// JavaScript on a negative half — "1 km further from base" against "2".
    /// </remarks>
    private static double Round(double value) => Math.Floor(value + 0.5);

    private static double Clamp(double value, double low = 0, double high = 1)
    {
        if (double.IsNaN(value) || double.IsInfinity(value)) return low;
        return Math.Min(high, Math.Max(low, value));
    }
}
