using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Domain.Tracking;

namespace Backhaul.Domain.Market;

/// <summary>A load, as the pairing engine needs it.</summary>
public sealed record PairLoad(
    Guid Id,
    string OriginName,
    string DestinationName,
    string Cargo,
    double WeightKg,
    Kobo Offered,
    DateTimeOffset ReadyFrom,
    TruckClass TruckClass,
    string? ShipperTier,
    double OriginLat,
    double OriginLon,
    double DestinationLat,
    double DestinationLon);

public enum PairRefusal
{
    TooHeavy,
    PickupsTooFar,
    DropsTooFar,
    WrongTruck,
    TooEmpty,
}

public abstract record PairVerdict
{
    public sealed record Ok(double Fill, double CollectM, double DeliverM) : PairVerdict;

    public sealed record No(PairRefusal Reason, string Detail) : PairVerdict;
}

public sealed record Pairing(
    PairLoad A,
    PairLoad B,
    double Fill,
    Kobo PaysA,
    Kobo PaysB,
    Kobo CarrierGets);

/// <summary>
/// Two part-loads, one truck.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/consolidation.ts</c>. Every refusal carries
/// a reason for the same reason the rest of this package does: a carrier
/// looking at a pair that nearly works needs to know which of the five things
/// is wrong, because one of them they might solve with a phone call.
/// </remarks>
public static class Consolidation
{
    /// <summary>How far apart two pickups may be.</summary>
    public static readonly double PickupSpreadM = 50_000;

    /// <summary>How far apart two deliveries may be.</summary>
    public static readonly double DropSpreadM = 80_000;

    /// <summary>Below this share of the truck, two sets of paperwork is not worth it.</summary>
    public static readonly double MinimumFill = 0.7;

    /// <summary>What each shipper saves by sharing.</summary>
    public static readonly int ShipperDiscountPct = 30;

    public static PairVerdict CanShare(PairLoad a, PairLoad b, TruckClass truck)
    {
        if (a.TruckClass != b.TruckClass)
        {
            return new PairVerdict.No(PairRefusal.WrongTruck, "These two ask for different kinds of truck.");
        }

        var tonnes = (a.WeightKg + b.WeightKg) / 1_000;
        var capacity = (double)Trucks.Capacity[truck];

        if (tonnes > capacity)
        {
            return new PairVerdict.No(
                PairRefusal.TooHeavy,
                $"{Round(tonnes)} t together, and this truck takes {capacity} t.");
        }

        var fill = tonnes / capacity;
        if (fill < MinimumFill)
        {
            return new PairVerdict.No(
                PairRefusal.TooEmpty,
                $"Together they still only fill {Round(fill * 100)}% of the truck — " +
                "not worth two sets of paperwork.");
        }

        var collect = (double)Geo.Distance(
            new Position(a.OriginLat, a.OriginLon, 0, a.ReadyFrom),
            new Position(b.OriginLat, b.OriginLon, 0, b.ReadyFrom));

        if (collect > PickupSpreadM)
        {
            return new PairVerdict.No(
                PairRefusal.PickupsTooFar,
                $"{Round(collect / 1_000)} km between the two pickups.");
        }

        var deliver = (double)Geo.Distance(
            new Position(a.DestinationLat, a.DestinationLon, 0, a.ReadyFrom),
            new Position(b.DestinationLat, b.DestinationLon, 0, b.ReadyFrom));

        if (deliver > DropSpreadM)
        {
            return new PairVerdict.No(
                PairRefusal.DropsTooFar,
                $"{Round(deliver / 1_000)} km between the two deliveries.");
        }

        return new PairVerdict.Ok(fill, collect, deliver);
    }

    // wired-check: reached only from Pairs() below, which the consolidation
    // parity case exercises, so every figure this produces is compared against
    // TypeScript. Public to match the shape packages/domain exports.
    public static Pairing Price(PairLoad a, PairLoad b, double fill)
    {
        var paysA = a.Offered - a.Offered.Percent(ShipperDiscountPct);
        var paysB = b.Offered - b.Offered.Percent(ShipperDiscountPct);

        return new Pairing(a, b, fill, paysA, paysB, paysA + paysB);
    }

    /// <summary>
    /// Every pair worth proposing, fullest first.
    /// </summary>
    /// <remarks>
    /// Quadratic, and deliberately so: a load board a carrier is looking at is
    /// a few dozen rows, and every clever index would need maintaining for a
    /// saving nobody can perceive.
    /// </remarks>
    public static IReadOnlyList<Pairing> Pairs(IReadOnlyList<PairLoad> loads, TruckClass truck)
    {
        var found = new List<Pairing>();

        for (var i = 0; i < loads.Count; i++)
        {
            for (var j = i + 1; j < loads.Count; j++)
            {
                if (CanShare(loads[i], loads[j], truck) is not PairVerdict.Ok verdict) continue;
                found.Add(Price(loads[i], loads[j], verdict.Fill));
            }
        }

        return found.OrderByDescending(p => p.Fill).ToList();
    }

    /// <summary>JavaScript's <c>Math.round</c>. See <see cref="Matching"/>.</summary>
    private static double Round(double value) => Math.Floor(value + 0.5);
}
