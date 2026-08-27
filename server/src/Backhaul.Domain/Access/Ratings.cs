namespace Backhaul.Domain.Access;

public enum CarrierClaim
{
    /// <summary>The truck turned up when it said it would.</summary>
    ArrivedToLoad,

    /// <summary>The driver could be reached during the trip.</summary>
    Reachable,

    /// <summary>The goods arrived in the condition they left in.</summary>
    CargoIntact,

    /// <summary>No money was asked for beyond what was agreed.</summary>
    NoExtras,
}

public enum ShipperClaim
{
    /// <summary>The load was ready when the truck got there.</summary>
    LoadReady,

    /// <summary>The described weight and goods were the actual weight and goods.</summary>
    AsDescribed,

    /// <summary>Paid within the terms agreed.</summary>
    PaidOnTime,

    /// <summary>Somebody was there to receive it.</summary>
    ReceiverPresent,
}

/// <summary>
/// One review. Only the claims the reviewer actually answered.
/// </summary>
/// <remarks>
/// A missing answer is missing, not a no. Somebody who did not tick "the driver
/// could be reached" may simply never have needed to call.
/// </remarks>
public sealed record Review(
    Guid TripId,
    DateTimeOffset At,
    IReadOnlyDictionary<string, bool> Answers,
    string Note);

public sealed record Tally(string Claim, int Yes, int Asked);

/// <summary>
/// What each side says about the other after a trip.
/// </summary>
/// <remarks>
/// <para>
/// Mirrors <c>packages/domain/src/ratings.ts</c>. <b>Not stars.</b> A five-star
/// average compresses "arrived late twice" and "damaged the load" into the same
/// 4.2, and on a two-sided market it drifts upward until everyone is 4.8 and
/// the rating carries no information at all.
/// </para>
/// <para>
/// A review is a small set of facts a person answers yes or no to, and what a
/// reader sees is how often each was true. "Loaded on time: 9 of 11 trips"
/// tells a shipper something; "4.6 stars" does not.
/// </para>
/// </remarks>
public static class Ratings
{
    public static readonly IReadOnlyList<CarrierClaim> CarrierClaims =
    [
        CarrierClaim.ArrivedToLoad,
        CarrierClaim.Reachable,
        CarrierClaim.CargoIntact,
        CarrierClaim.NoExtras,
    ];

    public static readonly IReadOnlyList<ShipperClaim> ShipperClaims =
    [
        ShipperClaim.LoadReady,
        ShipperClaim.AsDescribed,
        ShipperClaim.PaidOnTime,
        ShipperClaim.ReceiverPresent,
    ];

    /// <summary>
    /// How long after delivery a review may be left.
    /// </summary>
    /// <remarks>
    /// A week. Long enough for a shortage to surface; short enough that the
    /// review is about the trip rather than about the invoice argument that
    /// followed it.
    /// </remarks>
    public static readonly int ReviewWindowDays = 7;

    /// <summary>
    /// The fewest answers before a tally is worth rendering.
    /// </summary>
    /// <remarks>
    /// Three. Below that a single bad trip reads as a pattern, and the person
    /// it reads that way about has no way to outrun it — which is how a
    /// marketplace ends up with new carriers who can never get a first load.
    /// </remarks>
    public static readonly int MinimumAnswers = 3;

    public static bool Reviewable(DateTimeOffset deliveredAt, DateTimeOffset now)
    {
        var elapsed = (now - deliveredAt).TotalMilliseconds;
        return elapsed >= 0 && elapsed <= ReviewWindowDays * 86_400_000L;
    }

    /// <summary>
    /// How often each claim was true, across every review.
    /// </summary>
    /// <remarks>
    /// Counts, never a percentage: the denominator is the part that matters.
    /// "2 of 2" and "34 of 34" are the same fraction and not the same evidence,
    /// and a screen that renders only the fraction has thrown the difference
    /// away.
    /// </remarks>
    public static IReadOnlyList<Tally> Tallies(
        IReadOnlyList<Review> reviews,
        IReadOnlyList<string> claims)
    {
        return claims.Select(claim =>
        {
            var yes = 0;
            var asked = 0;

            foreach (var review in reviews)
            {
                if (!review.Answers.TryGetValue(claim, out var answer)) continue;
                asked++;
                if (answer) yes++;
            }

            return new Tally(claim, yes, asked);
        }).ToList();
    }

    public static bool WorthShowing(Tally tally) => tally.Asked >= MinimumAnswers;

    /// <summary>Short words for a tally on somebody's profile.</summary>
    public static string LabelCarrier(CarrierClaim claim) => claim switch
    {
        CarrierClaim.ArrivedToLoad => "Arrived to load on time",
        CarrierClaim.Reachable => "Reachable on the road",
        CarrierClaim.CargoIntact => "Goods arrived intact",
        CarrierClaim.NoExtras => "No charges beyond the quote",
        _ => throw new InvalidOperationException($"unmapped claim {claim}"),
    };

    public static string LabelShipper(ShipperClaim claim) => claim switch
    {
        ShipperClaim.LoadReady => "Load ready on arrival",
        ShipperClaim.AsDescribed => "Goods as described",
        ShipperClaim.PaidOnTime => "Paid within terms",
        ShipperClaim.ReceiverPresent => "Receiver present",
        _ => throw new InvalidOperationException($"unmapped claim {claim}"),
    };

    public static string CarrierWire(CarrierClaim claim) => claim switch
    {
        CarrierClaim.ArrivedToLoad => "arrived_to_load",
        CarrierClaim.Reachable => "reachable",
        CarrierClaim.CargoIntact => "cargo_intact",
        CarrierClaim.NoExtras => "no_extras",
        _ => throw new InvalidOperationException($"unmapped claim {claim}"),
    };

    public static string ShipperWire(ShipperClaim claim) => claim switch
    {
        ShipperClaim.LoadReady => "load_ready",
        ShipperClaim.AsDescribed => "as_described",
        ShipperClaim.PaidOnTime => "paid_on_time",
        ShipperClaim.ReceiverPresent => "receiver_present",
        _ => throw new InvalidOperationException($"unmapped claim {claim}"),
    };
}
