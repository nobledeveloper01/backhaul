namespace Backhaul.Domain.Access;

public enum VehiclePaper
{
    /// <summary>Vehicle licence. The annual one.</summary>
    Licence,
    Roadworthiness,
    Insurance,
    /// <summary>Hackney/haulage permit.</summary>
    Permit,
}

public enum Standing
{
    RoadLegal,
    /// <summary>In date, but something lapses inside the warning window.</summary>
    Expiring,
    /// <summary>At least one paper has run out.</summary>
    Lapsed,
    /// <summary>At least one has never been provided.</summary>
    Incomplete,
    Retired,
}

public sealed record VehicleAssessment(
    Standing Standing,
    IReadOnlyList<(VehiclePaper Paper, int Days)> Lapsed,
    IReadOnlyList<(VehiclePaper Paper, int Days)> Expiring,
    IReadOnlyList<VehiclePaper> Missing);

/// <summary>
/// The trucks themselves.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/vehicles.ts</c>. <see cref="Trust"/>
/// verifies a <i>carrier</i>; this verifies the thing that actually carries
/// the goods, and conflating them is how a Trusted carrier ends up moving
/// somebody's cargo on a trailer whose roadworthiness lapsed in March.
/// </remarks>
public static class Vehicles
{
    public static readonly VehiclePaper[] Papers =
    [
        VehiclePaper.Licence,
        VehiclePaper.Roadworthiness,
        VehiclePaper.Insurance,
        VehiclePaper.Permit,
    ];

    /// <summary>Where a truck stands, on a given day.</summary>
    /// <remarks>
    /// <c>now</c> is an argument, as everywhere: a dispute is argued about
    /// what was true on the day of the trip, not about what is true when
    /// somebody opens the app.
    /// </remarks>
    public static VehicleAssessment Assess(
        IReadOnlyDictionary<VehiclePaper, DateTimeOffset> expiries,
        DateTimeOffset? retiredAt,
        DateTimeOffset now)
    {
        if (retiredAt is not null && retiredAt <= now)
        {
            return new VehicleAssessment(Standing.Retired, [], [], []);
        }

        var missing = new List<VehiclePaper>();
        var lapsed = new List<(VehiclePaper, int)>();
        var expiring = new List<(VehiclePaper, int)>();

        foreach (var paper in Papers)
        {
            if (!expiries.TryGetValue(paper, out var on))
            {
                missing.Add(paper);
                continue;
            }

            // Truncated toward zero, not floored. Flooring is right for a
            // future date and wrong for a past one: a certificate that lapsed
            // nine days and one second ago floors to −10, and the screen says
            // "10 days out of date".
            var days = (int)Math.Truncate((on - now).TotalDays);
            if (days < 0) lapsed.Add((paper, days));
            else if (days <= Trust.ExpiryWarningDays) expiring.Add((paper, days));
        }

        lapsed.Sort((a, b) => a.Item2.CompareTo(b.Item2));
        expiring.Sort((a, b) => a.Item2.CompareTo(b.Item2));

        // Order matters: a lapsed paper is a worse fact than a missing one,
        // because a missing paper means the truck was never offered for work
        // and a lapsed one means it is working on something that stopped being
        // true.
        var standing = lapsed.Count > 0
            ? Standing.Lapsed
            : missing.Count > 0
                ? Standing.Incomplete
                : expiring.Count > 0
                    ? Standing.Expiring
                    : Standing.RoadLegal;

        return new VehicleAssessment(standing, lapsed, expiring, missing);
    }

    /// <summary>
    /// Whether this truck may be assigned to a trip today.
    /// </summary>
    /// <remarks>
    /// <see cref="Standing.Expiring"/> still may — a certificate with three
    /// weeks left is valid, and refusing work on it would take a truck off the
    /// road for being <i>about</i> to have a problem.
    /// </remarks>
    public static bool MayCarry(VehicleAssessment assessment) =>
        assessment.Standing is Standing.RoadLegal or Standing.Expiring;

    /// <summary>
    /// Whether a truck already on a trip should be stopped.
    /// </summary>
    /// <remarks>
    /// <b>No.</b> A paper that lapses mid-trip does not make the cargo safer by
    /// the side of the road. It is recorded and it blocks the <i>next</i>
    /// assignment, which is where the pressure belongs — on the office, not on
    /// a driver eight hundred kilometres from home.
    /// </remarks>
    public static bool MustStopMidTrip() => false;

    public static string ToWire(Standing standing) => standing switch
    {
        Standing.RoadLegal => "road_legal",
        Standing.Expiring => "expiring",
        Standing.Lapsed => "lapsed",
        Standing.Incomplete => "incomplete",
        Standing.Retired => "retired",
        _ => throw new InvalidOperationException($"unmapped standing {standing}"),
    };

    public static string ToWire(VehiclePaper paper) => paper switch
    {
        VehiclePaper.Licence => "licence",
        VehiclePaper.Roadworthiness => "roadworthiness",
        VehiclePaper.Insurance => "insurance",
        VehiclePaper.Permit => "permit",
        _ => throw new InvalidOperationException($"unmapped paper {paper}"),
    };

    public static VehiclePaper? PaperFromWire(string wire) => wire switch
    {
        "licence" => VehiclePaper.Licence,
        "roadworthiness" => VehiclePaper.Roadworthiness,
        "insurance" => VehiclePaper.Insurance,
        "permit" => VehiclePaper.Permit,
        _ => null,
    };
}
