namespace Backhaul.Domain.Money;

/// <summary>One delivered trip, from the driver's side of it.</summary>
public sealed record Earning(
    Guid TripId,
    string Corridor,
    DateTimeOffset DeliveredAt,
    double DistanceM,
    Kobo Pay,
    Kobo Advance,
    Kobo Spent,
    DateTimeOffset? PaidAt);

public sealed record Statement(
    DateTimeOffset From,
    DateTimeOffset To,
    int Trips,
    double DistanceM,
    Kobo Earned,
    Kobo OutOfPocket,
    Kobo Outstanding,
    Kobo Settled);

/// <summary>
/// What the driver made, and what is still owed.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/earnings.ts</c>.
/// </remarks>
public static class Earnings
{
    /// <summary>
    /// Below this, a per-kilometre rate is arithmetic rather than information.
    /// </summary>
    public static readonly int MinimumTripsForPerKm = 3;

    /// <summary>
    /// A statement over a window.
    /// </summary>
    /// <remarks>
    /// The window is passed in rather than derived from the data: "this month"
    /// is a question about a calendar, and a function that guesses which month
    /// somebody means from the trips it happens to hold will be wrong in the
    /// first week of every one.
    /// </remarks>
    public static Statement Of(IReadOnlyList<Earning> earnings, DateTimeOffset from, DateTimeOffset to)
    {
        var inWindow = earnings.Where(e => e.DeliveredAt >= from && e.DeliveredAt <= to).ToList();

        var earned = inWindow.Aggregate(Kobo.Zero, (total, e) => total + e.Pay);

        // Only where they spent *more* than the advance. A trip where they
        // came back with change is not a credit against a trip where they did
        // not — those are two separate settlements, and netting them across
        // trips is how a driver ends up owed money nobody can account for.
        var outOfPocket = inWindow.Aggregate(
            Kobo.Zero,
            (total, e) => total + new Kobo(Math.Max(0, e.Spent.Value - e.Advance.Value)));

        var settled = inWindow
            .Where(e => e.PaidAt is not null)
            .Aggregate(Kobo.Zero, (total, e) => total + e.Pay);

        return new Statement(
            from,
            to,
            inWindow.Count,
            inWindow.Sum(e => e.DistanceM),
            earned,
            outOfPocket,
            earned + outOfPocket - settled,
            settled);
    }

    /// <summary>What a kilometre earned, or null below the threshold.</summary>
    public static Kobo? PerKilometre(Statement found)
    {
        if (found.Trips < MinimumTripsForPerKm || found.DistanceM == 0) return null;
        return new Kobo((long)Math.Round(
            found.Earned.Value / (found.DistanceM / 1_000d),
            MidpointRounding.AwayFromZero));
    }

    /// <summary>
    /// Trips whose pay is still outstanding, oldest first.
    /// </summary>
    /// <remarks>
    /// Oldest first because that is the one to ask about. Newest-first puts the
    /// trip from six weeks ago — the one that has actually gone wrong — at the
    /// bottom where nobody scrolls.
    /// </remarks>
    public static IReadOnlyList<Earning> Unpaid(IReadOnlyList<Earning> earnings) =>
        earnings.Where(e => e.PaidAt is null).OrderBy(e => e.DeliveredAt).ToList();

    /// <summary>How long the oldest unpaid trip has been waiting, or null.</summary>
    public static long? LongestWaitMs(IReadOnlyList<Earning> earnings, DateTimeOffset now)
    {
        var oldest = Unpaid(earnings).FirstOrDefault();
        return oldest is null ? null : (long)(now - oldest.DeliveredAt).TotalMilliseconds;
    }
}
