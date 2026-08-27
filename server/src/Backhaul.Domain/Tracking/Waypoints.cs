namespace Backhaul.Domain.Tracking;

public enum WaypointKind
{
    Origin,
    Destination,
    Checkpoint,
    Rest,
}

/// <summary>
/// A place a trip is meant to pass through.
/// </summary>
/// <remarks>
/// <c>RadiusM</c> is how close counts as "there", and it is per waypoint
/// rather than global: a depot yard is a couple of hundred metres and a border
/// post is a queue that can stretch for two kilometres.
/// </remarks>
public sealed record Waypoint(
    Guid Id,
    string Name,
    double Lat,
    double Lon,
    WaypointKind Kind,
    double RadiusM);

/// <summary>A stay inside a waypoint's fence.</summary>
public sealed record Visit(
    Waypoint Waypoint,
    DateTimeOffset Arrived,
    DateTimeOffset? Left,
    long DurationMs,
    int Fixes);

/// <summary>
/// Whether the truck was at a place, and for how long.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/waypoints.ts</c> and is held to it by the
/// parity fixtures. The arithmetic decides when demurrage starts, which makes
/// it the most financially consequential code here after settlement.
/// </remarks>
public static class Waypoints
{
    /// <summary>The smallest radius worth setting.</summary>
    /// <remarks>
    /// Below this, a fix's own uncertainty is larger than the fence, so
    /// arrival would depend on which way the phone happened to be wrong.
    /// </remarks>
    public const double MinimumRadiusM = 150;

    /// <summary>
    /// Whether a fix is inside a fence.
    /// </summary>
    /// <remarks>
    /// The fix's own accuracy widens the fence, for the same reason
    /// <c>Geo.IsWithin</c> does: a truck reported 190 m from a gate by a fix
    /// accurate to ±90 m may well be in the yard, and refusing arrival on that
    /// basis strands a driver at a barrier while demurrage runs.
    /// </remarks>
    public static bool Inside(Position fix, Waypoint waypoint) =>
        Geo.Distance(fix, new Position(waypoint.Lat, waypoint.Lon, 0, fix.At))
            <= waypoint.RadiusM + fix.Accuracy;

    /// <summary>
    /// Every visit to every waypoint, in the order they happened.
    /// </summary>
    /// <remarks>
    /// A truck that leaves and comes back records two visits rather than one
    /// long one: merging them would inflate a demurrage claim, and the two are
    /// distinguishable from the track.
    ///
    /// The track must be cleaned first — a single bad fix inside a fence would
    /// otherwise be an arrival, and one outside a departure.
    /// </remarks>
    public static IReadOnlyList<Visit> Visits(
        IReadOnlyList<Position> track,
        IReadOnlyList<Waypoint> waypoints)
    {
        var found = new List<Visit>();

        foreach (var waypoint in waypoints)
        {
            DateTimeOffset? arrivedAt = null;
            DateTimeOffset? lastInside = null;
            var fixes = 0;

            foreach (var fix in track)
            {
                if (Inside(fix, waypoint))
                {
                    if (arrivedAt is null)
                    {
                        arrivedAt = fix.At;
                        fixes = 0;
                    }

                    lastInside = fix.At;
                    fixes++;
                    continue;
                }

                if (arrivedAt is not null && lastInside is not null)
                {
                    found.Add(new Visit(
                        waypoint,
                        arrivedAt.Value,
                        fix.At,
                        // To the first fix *outside*, not the last one inside:
                        // the truck was still there for part of the gap, and a
                        // demurrage claim should not lose that to a rounding.
                        (long)(fix.At - arrivedAt.Value).TotalMilliseconds,
                        fixes));

                    arrivedAt = null;
                    lastInside = null;
                    fixes = 0;
                }
            }

            if (arrivedAt is not null && lastInside is not null)
            {
                found.Add(new Visit(
                    waypoint,
                    arrivedAt.Value,
                    null,
                    (long)(lastInside.Value - arrivedAt.Value).TotalMilliseconds,
                    fixes));
            }
        }

        return [.. found.OrderBy(v => v.Arrived)];
    }

    /// <summary>
    /// Waiting time that counts toward demurrage.
    /// </summary>
    /// <remarks>
    /// Origin and destination only. A queue at a checkpoint is nobody's fault
    /// and nobody's bill.
    /// </remarks>
    public static long ChargeableWaitingMs(IReadOnlyList<Visit> visits) =>
        visits
            .Where(v => v.Waypoint.Kind is WaypointKind.Origin or WaypointKind.Destination)
            .Sum(v => v.DurationMs);

    public static string ToWire(WaypointKind kind) => kind switch
    {
        WaypointKind.Origin => "origin",
        WaypointKind.Destination => "destination",
        WaypointKind.Checkpoint => "checkpoint",
        WaypointKind.Rest => "rest",
        _ => throw new InvalidOperationException($"unmapped waypoint kind {kind}"),
    };

    public static WaypointKind? FromWire(string wire) => wire switch
    {
        "origin" => WaypointKind.Origin,
        "destination" => WaypointKind.Destination,
        "checkpoint" => WaypointKind.Checkpoint,
        "rest" => WaypointKind.Rest,
        _ => null,
    };
}
