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
    // wired-check: nothing calls this and nothing ever has. It has no mirror in
    // packages/domain/src/trust.ts either — TierOf reads the four fields
    // directly — so it is a convenience, not a rule, and there is no second
    // implementation for it to disagree with. Kept because an exhaustive switch
    // over an enum cannot drift; it is dead weight rather than a hazard.
    public bool Has(Paper paper) => paper switch
    {
        Paper.Identity => Identity,
        Paper.Licence => Licence,
        Paper.Registration => Registration,
        Paper.Insurance => Insurance,
        _ => false,
    };
}

/// <summary>What a carrier's history says about them.</summary>
/// <param name="TripsCompleted">Deliveries, all of them.</param>
/// <param name="TripsPromised">
/// Of those, the ones that had a promised arrival to be judged against.
/// <para>
/// The denominator of the punctuality figure, and not the same number as
/// <paramref name="TripsCompleted"/>. A trip that was tracked but never traded
/// has no promise on it, and counting it either way is a lie: as on time it
/// flatters a carrier who was never held to anything, and as late it punishes
/// them for a deadline nobody set. This repository used to send
/// <c>onTime = completed</c>, which put every carrier at a hundred per cent.
/// </para>
/// </param>
/// <param name="TripsOnTime">Of the promised ones, how many arrived by the promise.</param>
/// <param name="Incidents">Upheld reports. One is a bad day; three is a pattern.</param>
public sealed record TrackRecord(
    int TripsCompleted,
    int TripsPromised,
    int TripsOnTime,
    int Incidents);

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
        // One answer about punctuality, and it can be "not enough to say".
        // `OnTimeRate` is the same function the screen shows a percentage
        // from, and it is null below five promised trips — so a tier naming a
        // punctuality bar is not earned on one kept promise any more than a
        // badge is printed from one. The ladder fails closed.
        var rate = OnTimeRate(record);

        var ladder = new[] { Tier.Trusted, Tier.Business, Tier.Verified, Tier.Unverified };

        var earned = ladder.FirstOrDefault(
            tier =>
            {
                var need = Requirements[tier];
                return need.Docs.All(papers.Has)
                    && record.TripsCompleted >= need.Trips
                    && (need.OnTime == 0 || (rate is { } got && got >= need.OnTime));
            },
            Tier.Unverified);

        if (record.Incidents == 0) return earned;

        var index = Array.IndexOf(ladder, earned);
        var dropped = Math.Min(ladder.Length - 1, index + record.Incidents);
        return ladder[dropped];
    }

    /// <summary>On-time as a fraction, or null below the threshold.</summary>
    /// <remarks>
    /// Counted over trips that had a promise. Five deliveries with no deadline
    /// between them is not five pieces of evidence about punctuality, and the
    /// shape of this answer — a rate or nothing — is what stops a screen
    /// showing a percentage nobody earned.
    /// </remarks>
    public static double? OnTimeRate(TrackRecord record) =>
        record.TripsPromised < MinimumTripsForRate
            ? null
            : (double)record.TripsOnTime / record.TripsPromised;

    public static string ToWire(Tier tier) => tier switch
    {
        Tier.Unverified => "unverified",
        Tier.Verified => "verified",
        Tier.Business => "business",
        Tier.Trusted => "trusted",
        _ => throw new InvalidOperationException($"unmapped tier {tier}"),
    };
}
