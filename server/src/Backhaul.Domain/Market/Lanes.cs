using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;

namespace Backhaul.Domain.Market;

public enum Cadence
{
    Weekly,
    Fortnightly,
    Monthly,
    AdHoc,
}

/// <summary>A run a shipper makes again and again.</summary>
public sealed record Lane(
    Guid Id,
    Guid ShipperId,
    string Name,
    string Origin,
    string Destination,
    string Cargo,
    double WeightKg,
    TruckClass Truck,
    Cadence Cadence,
    IReadOnlyList<Kobo> History,
    DateTimeOffset? LastRunAt);

/// <summary>
/// The runs a shipper makes again.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/lanes.ts</c>.
/// </remarks>
public static class Lanes
{
    public static readonly IReadOnlyDictionary<Cadence, long> CadenceMs =
        new Dictionary<Cadence, long>
        {
            [Cadence.Weekly] = 7 * 86_400_000L,
            [Cadence.Fortnightly] = 14 * 86_400_000L,
            [Cadence.Monthly] = 30 * 86_400_000L,
            // Not a schedule. Never produces a "due" prompt.
            [Cadence.AdHoc] = 0,
        };

    /// <summary>
    /// Whether this lane is about to come round again.
    /// </summary>
    /// <remarks>
    /// Two days of warning, so a shipper posts before the day rather than on
    /// it — a load posted the morning it must move is a load that goes to
    /// whoever is nearest rather than to whoever is best.
    /// </remarks>
    public static readonly long DueWarningMs = 2 * 86_400_000L;

    /// <summary>
    /// The median of the last six, not the average of everything.
    /// </summary>
    /// <remarks>
    /// A lane's price drifts, and a mean over two years anchors a shipper to a
    /// number that stopped being true — while one panic-priced trip during a
    /// fuel shortage would drag an average for a year.
    /// </remarks>
    public static readonly int RecentRuns = 6;

    public static readonly int MinimumRunsForTypical = 3;

    /// <summary>
    /// How far either way counts as unusual.
    /// </summary>
    /// <remarks>
    /// A quarter. Not an error and not a refusal — a shipper paying 40% over
    /// their own usual rate may have a reason, and a platform that blocks it is
    /// a platform they work around. It is a sentence, shown once.
    /// </remarks>
    public static readonly double UnusualFraction = 0.25;

    public static long? DueIn(Lane lane, DateTimeOffset now)
    {
        if (lane.Cadence == Cadence.AdHoc || lane.LastRunAt is not { } last) return null;
        return (long)(last.AddMilliseconds(CadenceMs[lane.Cadence]) - now).TotalMilliseconds;
    }

    public static bool IsDue(Lane lane, DateTimeOffset now) =>
        DueIn(lane, now) is { } remaining && remaining <= DueWarningMs;

    public static Kobo? TypicalPrice(Lane lane)
    {
        if (lane.History.Count < MinimumRunsForTypical) return null;

        var recent = lane.History
            .Skip(Math.Max(0, lane.History.Count - RecentRuns))
            .Select(k => k.Value)
            .OrderBy(v => v)
            .ToList();

        var middle = recent.Count / 2;

        if (recent.Count % 2 == 1) return new Kobo(recent[middle]);

        return new Kobo((long)Math.Round(
            (recent[middle - 1] + recent[middle]) / 2d,
            MidpointRounding.AwayFromZero));
    }

    public static bool IsUnusual(Lane lane, Kobo offered)
    {
        if (TypicalPrice(lane) is not { } typical || typical.Value == 0) return false;
        return Math.Abs(offered.Value - typical.Value) / (double)typical.Value > UnusualFraction;
    }

    /// <summary>
    /// Lanes worth showing at the top, most overdue first.
    /// </summary>
    /// <remarks>
    /// Ad-hoc lanes never appear here. A list that prompts about something with
    /// no schedule is a list that prompts about everything.
    /// </remarks>
    public static IReadOnlyList<Lane> Due(IReadOnlyList<Lane> lanes, DateTimeOffset now) =>
        lanes.Where(lane => IsDue(lane, now)).OrderBy(lane => DueIn(lane, now) ?? 0).ToList();

    /// <summary>How often, in words.</summary>
    public static string DescribeCadence(Cadence cadence) => cadence switch
    {
        Cadence.Weekly => "Every week",
        Cadence.Fortnightly => "Every two weeks",
        Cadence.Monthly => "Every month",
        Cadence.AdHoc => "When needed",
        _ => throw new InvalidOperationException($"unmapped cadence {cadence}"),
    };

    /// <summary>When it is next expected, in words a person would say.</summary>
    public static string DescribeDue(Lane lane, DateTimeOffset now)
    {
        if (DueIn(lane, now) is not { } remaining) return DescribeCadence(lane.Cadence);

        // JavaScript's `Math.round`: halves go up, not away from zero. A lane
        // half a day overdue is -0.5 days, and away-from-zero would call it
        // "1 days overdue" where the app says "Due today".
        var days = (int)Math.Floor(remaining / 86_400_000d + 0.5);

        if (days < 0) return $"{Math.Abs(days)} days overdue";
        if (days == 0) return "Due today";
        if (days == 1) return "Due tomorrow";
        return $"Due in {days} days";
    }

    public static string ToWire(Cadence cadence) => cadence switch
    {
        Cadence.Weekly => "weekly",
        Cadence.Fortnightly => "fortnightly",
        Cadence.Monthly => "monthly",
        Cadence.AdHoc => "ad_hoc",
        _ => throw new InvalidOperationException($"unmapped cadence {cadence}"),
    };

    public static Cadence? FromWire(string wire) => wire switch
    {
        "weekly" => Cadence.Weekly,
        "fortnightly" => Cadence.Fortnightly,
        "monthly" => Cadence.Monthly,
        "ad_hoc" => Cadence.AdHoc,
        _ => null,
    };
}
