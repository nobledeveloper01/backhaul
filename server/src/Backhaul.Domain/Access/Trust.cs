namespace Backhaul.Domain.Access;

public enum Tier
{
    Unverified,
    Verified,
    Business,
    Trusted,
}

public enum Paper
{
    /// <summary>Government ID.</summary>
    Identity,
    Licence,
    /// <summary>Company registration. What separates a person from a business.</summary>
    Registration,
    /// <summary>Goods-in-transit cover. Backhaul verifies it; it does not underwrite.</summary>
    Insurance,
}

public sealed record Papers(bool Identity, bool Licence, bool Registration, bool Insurance)
{
    public bool Has(Paper paper) => paper switch
    {
        Paper.Identity => Identity,
        Paper.Licence => Licence,
        Paper.Registration => Registration,
        Paper.Insurance => Insurance,
        _ => false,
    };
}

public sealed record TrackRecord(int TripsCompleted, int TripsOnTime, int Incidents);

/// <summary>
/// Whether a stranger with a truck can be trusted with eight million naira of
/// somebody's goods.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/trust.ts</c>. Everything is <b>computed,
/// never self-reported</b>: a carrier cannot set their own on-time percentage
/// any more than they can set their own kilometres, because a rating somebody
/// can type in is a rating worth nothing.
/// </remarks>
public static class Trust
{
    private static readonly Dictionary<Tier, (Paper[] Docs, int Trips, double OnTime)> Requirements =
        new()
        {
            [Tier.Unverified] = ([], 0, 0),
            [Tier.Verified] = ([Paper.Identity, Paper.Licence], 0, 0),
            [Tier.Business] = ([Paper.Identity, Paper.Licence, Paper.Registration], 5, 0.7),
            [Tier.Trusted] =
                ([Paper.Identity, Paper.Licence, Paper.Registration, Paper.Insurance], 20, 0.9),
        };

    /// <summary>How many days ahead a lapsing document is warned about.</summary>
    public const int ExpiryWarningDays = 30;

    /// <summary>Below this many trips, there is no on-time figure at all.</summary>
    /// <remarks>
    /// "100% on time" from one delivery is true and completely misleading, and
    /// it is the number a shipper decides on.
    /// </remarks>
    public const int MinimumTripsForRate = 5;

    /// <summary>
    /// The highest tier this carrier has earned.
    /// </summary>
    /// <remarks>
    /// <b>An upheld incident drops a carrier one tier</b>, and does not zero
    /// them. Somebody whose truck was robbed is not thereby untrustworthy, and
    /// a system that treats one bad trip as career-ending is one that carriers
    /// will lie to.
    /// </remarks>
    public static Tier TierOf(Papers papers, TrackRecord record)
    {
        var onTime = record.TripsCompleted == 0
            ? 0
            : (double)record.TripsOnTime / record.TripsCompleted;

        var ladder = new[] { Tier.Trusted, Tier.Business, Tier.Verified, Tier.Unverified };

        var earned = ladder.FirstOrDefault(
            tier =>
            {
                var need = Requirements[tier];
                return need.Docs.All(papers.Has)
                    && record.TripsCompleted >= need.Trips
                    && onTime >= need.OnTime;
            },
            Tier.Unverified);

        if (record.Incidents == 0) return earned;

        var index = Array.IndexOf(ladder, earned);
        var dropped = Math.Min(ladder.Length - 1, index + record.Incidents);
        return ladder[dropped];
    }

    /// <summary>On-time as a fraction, or null below the threshold.</summary>
    public static double? OnTimeRate(TrackRecord record) =>
        record.TripsCompleted < MinimumTripsForRate
            ? null
            : (double)record.TripsOnTime / record.TripsCompleted;

    public static string ToWire(Tier tier) => tier switch
    {
        Tier.Unverified => "unverified",
        Tier.Verified => "verified",
        Tier.Business => "business",
        Tier.Trusted => "trusted",
        _ => throw new InvalidOperationException($"unmapped tier {tier}"),
    };
}
