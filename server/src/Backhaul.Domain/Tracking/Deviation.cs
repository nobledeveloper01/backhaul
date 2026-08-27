namespace Backhaul.Domain.Tracking;

public abstract record DeviationVerdict
{
    public sealed record OnCourse : DeviationVerdict;

    /// <summary>Not enough track to say anything. Not the same as "on course".</summary>
    public sealed record Unknown(string Detail) : DeviationVerdict;

    public sealed record Deviating(double FurtherM, long SinceMs, string Detail) : DeviationVerdict;
}

/// <summary>
/// Is the truck going somewhere it should not be?
/// </summary>
/// <remarks>
/// <para>
/// Mirrors <c>packages/domain/src/deviation.ts</c>. The obvious implementation
/// is cross-track distance — draw a line from origin to destination and measure
/// how far the truck is from it — and it is <b>wrong here in a way that would
/// have shipped</b>. The straight line from Lagos to Kano runs through Kwara
/// farmland; the road goes Ibadan–Ilorin–Jebba–Mokwa–Tegina–Kaduna and is up to
/// 90 km off that line for hours. An alarm that fires on every correct trip is
/// an alarm nobody reads.
/// </para>
/// <para>
/// The honest signal without a corpus of real routes is <b>progress</b>: a
/// truck that has been getting further from its destination for long enough,
/// while moving, is going somewhere else. That is true whatever road it is on.
/// </para>
/// </remarks>
public static class Deviation
{
    /// <summary>
    /// How much further away it has to get before that means anything.
    /// </summary>
    /// <remarks>
    /// 25 km. Smaller than a wrong turn that matters and larger than every
    /// legitimate loop this corridor makes — the Lokoja bypass, the Jebba
    /// bridge approach, and every diversion around a broken-down trailer.
    /// </remarks>
    public static readonly double DeviationM = 25_000;

    /// <summary>
    /// How long it has to keep doing it.
    /// </summary>
    /// <remarks>
    /// Ninety minutes. Long enough that a detour around a flooded stretch has
    /// rejoined by the time it would fire, short enough that a hijacked truck
    /// is reported while it is still findable.
    /// </remarks>
    public static readonly long DeviationWindowMs = 90 * 60_000L;

    /// <summary>
    /// Whether the truck has been moving away from where it is going.
    /// </summary>
    /// <remarks>
    /// Compares the current distance-to-destination against the <em>smallest</em>
    /// it has been inside the window — not the first. A truck that closed on
    /// the destination and then turned around has deviated by the amount it has
    /// given back, and measuring from the window's first fix would let a turn
    /// hide behind whatever progress preceded it.
    /// </remarks>
    public static DeviationVerdict Of(
        IReadOnlyList<Position> track,
        Position destination,
        DateTimeOffset now)
    {
        var window = track
            .Where(fix => (now - fix.At).TotalMilliseconds <= DeviationWindowMs)
            .ToList();

        if (window.Count == 0)
        {
            return new DeviationVerdict.Unknown("No positions in the last hour and a half.");
        }

        // Two fixes ninety minutes apart is a coverage gap, not a course.
        // Calling that a deviation would turn a dead zone into an accusation.
        if (window.Count < 4)
        {
            return new DeviationVerdict.Unknown("Too few positions to say which way it is heading.");
        }

        var spanned = (long)(window[^1].At - window[0].At).TotalMilliseconds;
        if (spanned < DeviationWindowMs / 2)
        {
            return new DeviationVerdict.Unknown("Not enough of the window is covered yet.");
        }

        var closest = window.Min(fix => Geo.Distance(fix, destination));
        var further = (double)(Geo.Distance(window[^1], destination) - closest);

        if (further < DeviationM) return new DeviationVerdict.OnCourse();

        return new DeviationVerdict.Deviating(
            further,
            spanned,
            $"{Math.Floor(further / 1_000 + 0.5)} km further from the destination than it was, " +
            "and still going.");
    }

    /// <summary>
    /// Whether the truck is anywhere near a declared route.
    /// </summary>
    /// <remarks>
    /// Null when there is no route to be off — which is different from being on
    /// one, and the caller has to say so rather than rendering a reassuring
    /// tick. Measures to the nearest waypoint rather than to a line between
    /// them: the line is not the road.
    /// </remarks>
    public static bool? OffRoute(
        Position fix,
        IReadOnlyList<Waypoint> route,
        double? tolerance = null)
    {
        if (route.Count == 0) return null;

        var limit = tolerance ?? DeviationM;
        var nearest = route.Min(waypoint =>
            Geo.Distance(fix, new Position(waypoint.Lat, waypoint.Lon, 0, fix.At)));
        var atOne = route.Any(waypoint => Waypoints.Inside(fix, waypoint));

        return !atOne && nearest > limit;
    }

    /// <summary>
    /// The next waypoint the truck should be heading for.
    /// </summary>
    /// <remarks>
    /// The first one it has not reached, in the order given. Used to say
    /// "expected at the weighbridge" rather than "expected somewhere", which is
    /// the difference between an alert somebody can act on and one they can
    /// only worry about.
    /// </remarks>
    public static Waypoint? Heading(IReadOnlyList<Guid> visited, IReadOnlyList<Waypoint> route) =>
        route.FirstOrDefault(waypoint => !visited.Contains(waypoint.Id));
}
