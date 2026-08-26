namespace Backhaul.Domain.Tracking;

/// <summary>What the fixes say about the truck right now.</summary>
/// <remarks>
/// Deliberately not the same vocabulary as <see cref="Trips.TripState"/>: this
/// is an observation, and the trip state is a decision made from it. Keeping
/// them separate is what lets a shipper mark a trip disputed while the tracker
/// still honestly says the truck is moving.
/// </remarks>
public enum Observation
{
    Moving,
    Stopped,
    Stalled,
    Silent,

    /// <summary>
    /// Not enough evidence to say. A first-class answer, and returning it is
    /// the point: a trip with two fixes an hour apart is not a stalled truck,
    /// it is a truck nobody has enough information about. Guessing
    /// <see cref="Moving"/> would put a shipper's mind at rest on nothing.
    /// </summary>
    Unknown,
}

public static class Tracker
{
    /// <summary>How long silence has to last before it means something.</summary>
    /// <remarks>
    /// Twenty minutes, not five. Nigerian coverage on the northern corridors
    /// drops for a quarter of an hour at a time as a matter of course, and a
    /// shipper pinged every time it happens stops reading the pings — at which
    /// point the alert that matters is one of forty they ignored that day.
    /// </remarks>
    public static readonly TimeSpan SignalLostAfter = TimeSpan.FromMinutes(20);

    /// <summary>
    /// How long a truck must sit still, away from anywhere it is meant to be,
    /// before it counts as stalled.
    /// </summary>
    /// <remarks>
    /// Forty-five minutes covers a meal, a prayer, a fuel queue and a
    /// checkpoint. It does not cover a breakdown, and a breakdown is what this
    /// is for.
    /// </remarks>
    public static readonly TimeSpan StalledAfter = TimeSpan.FromMinutes(45);

    /// <summary>How far a truck may drift and still count as not having moved.</summary>
    public const long StallRadiusM = 250;

    public static Observation Observe(
        IReadOnlyList<Position> recent,
        DateTimeOffset now,
        bool atWaypoint = false)
    {
        if (recent.Count == 0)
        {
            return Observation.Unknown;
        }

        var last = recent[^1];
        if (now - last.At >= SignalLostAfter)
        {
            return Observation.Silent;
        }

        // Everything below needs a window of fixes to compare against. One fix
        // is a position, not a behaviour.
        if (recent.Count < 2)
        {
            return Observation.Unknown;
        }

        var first = recent[0];
        var window = last.At - first.At;
        var moved = Geo.Distance(first, last);

        if (moved > StallRadiusM)
        {
            return Observation.Moving;
        }

        // It has not moved. Whether that is a stop or a stall depends on how
        // long the fixes actually cover, and a short window cannot tell us.
        if (window < StalledAfter)
        {
            return Observation.Stopped;
        }

        // A truck parked at the depot it was told to load at is not stalled, it
        // is waiting. That distinction is the whole difference between a useful
        // alert and one that fires on every scheduled stop.
        return atWaypoint ? Observation.Stopped : Observation.Stalled;
    }

    /// <summary>
    /// How long the truck has been silent, or null when there are no fixes at
    /// all — which is different from having been silent forever, and renders
    /// as "not started" rather than "no signal for 9 hours".
    /// </summary>
    public static TimeSpan? SilentFor(IReadOnlyList<Position> recent, DateTimeOffset now)
    {
        if (recent.Count == 0)
        {
            return null;
        }

        var since = now - recent[^1].At;
        return since < TimeSpan.Zero ? TimeSpan.Zero : since;
    }
}
