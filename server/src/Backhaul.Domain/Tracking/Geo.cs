namespace Backhaul.Domain.Tracking;

/// <summary>A position fix as the device captured it.</summary>
public sealed record Position(
    double Lat,
    double Lon,
    double Accuracy,
    DateTimeOffset At,
    double? Speed = null,
    double? Battery = null);

/// <summary>Why a fix should not be trusted.</summary>
/// <remarks>
/// Named rather than boolean: the UI says something different for each, and a
/// dispute pack prints the reason beside the excluded fix.
/// </remarks>
public enum FixProblem
{
    /// <summary>The OS itself says it does not know where the phone is.</summary>
    TooImprecise,

    /// <summary>Dated before the fix preceding it.</summary>
    OutOfOrder,

    /// <summary>Implies a speed no truck reaches — usually a cell-tower fix.</summary>
    ImplausibleJump,
}

public sealed record DroppedFix(Position Fix, FixProblem Problem);

public sealed record CleanedTrack(
    IReadOnlyList<Position> Kept,
    IReadOnlyList<DroppedFix> Dropped);

public static class Geo
{
    private const double EarthRadiusM = 6_371_008.8;

    /// <summary>
    /// Beyond this, a fix says nothing useful about which road a truck is on.
    /// </summary>
    /// <remarks>
    /// A generous floor, deliberately: on a highway with no buildings a phone
    /// often reports 40–80 m, and rejecting those throws away most of the trip
    /// to gain precision nobody is using.
    /// </remarks>
    public const double MaxUsefulAccuracyM = 100;

    /// <summary>The fastest a loaded truck plausibly moves, in metres per second.</summary>
    /// <remarks>
    /// 45 m/s is 162 km/h. No loaded trailer does that on a Nigerian highway,
    /// so anything above it is a bad fix rather than a fast truck. Set well
    /// above the real ceiling on purpose: excluding a genuine fix loses
    /// evidence, while admitting a rare bad one is a spike anyone can see.
    /// </remarks>
    public const double MaxPlausibleSpeedMs = 45;

    /// <summary>Great-circle distance in metres.</summary>
    /// <remarks>
    /// Haversine, not the flat-earth approximation. The approximation is fine
    /// over a city; Lagos to Maiduguri is 1,600 km, far enough that its error
    /// is measured in kilometres — and kilometres are what a haulage rate
    /// multiplies.
    /// </remarks>
    public static long Distance(Position a, Position b)
    {
        var dLat = ToRad(b.Lat - a.Lat);
        var dLon = ToRad(b.Lon - a.Lon);
        var lat1 = ToRad(a.Lat);
        var lat2 = ToRad(b.Lat);

        var h = Math.Pow(Math.Sin(dLat / 2), 2) +
                (Math.Cos(lat1) * Math.Cos(lat2) * Math.Pow(Math.Sin(dLon / 2), 2));

        return (long)Math.Round(
            2 * EarthRadiusM * Math.Asin(Math.Min(1, Math.Sqrt(h))),
            MidpointRounding.AwayFromZero);
    }

    public static long PathLength(IReadOnlyList<Position> path)
    {
        long total = 0;
        for (var i = 1; i < path.Count; i++)
        {
            total += Distance(path[i - 1], path[i]);
        }

        return total;
    }

    /// <summary>Checks a fix against the one before it; null when it is usable.</summary>
    public static FixProblem? ProblemWith(Position fix, Position? previous)
    {
        if (double.IsNaN(fix.Accuracy) || double.IsInfinity(fix.Accuracy) ||
            fix.Accuracy > MaxUsefulAccuracyM)
        {
            return FixProblem.TooImprecise;
        }

        if (previous is null)
        {
            return null;
        }

        var seconds = (fix.At - previous.At).TotalSeconds;
        if (seconds < 0)
        {
            return FixProblem.OutOfOrder;
        }

        var moved = Distance(previous, fix);

        if (seconds == 0)
        {
            // Same instant, different place. Distinguishable from a duplicate
            // only by the distance, and a duplicate is not a problem.
            return moved > MaxUsefulAccuracyM ? FixProblem.ImplausibleJump : null;
        }

        // The jump has to clear the combined uncertainty of both fixes before
        // it counts as movement at all. Two 90 m fixes of a parked truck can
        // otherwise read as 180 m of travel, and an overnight stop invents
        // kilometres onto a per-kilometre rate.
        var slack = previous.Accuracy + fix.Accuracy;
        if (moved <= slack)
        {
            return null;
        }

        return (moved - slack) / seconds > MaxPlausibleSpeedMs
            ? FixProblem.ImplausibleJump
            : null;
    }

    /// <summary>Filters a raw track, keeping what was dropped and why.</summary>
    /// <remarks>
    /// The dropped fixes are returned rather than discarded: a driver whose
    /// distance is disputed is owed the answer to "what did you throw away?",
    /// and a track that is 40% dropped is a broken phone somebody should be
    /// told about rather than a quietly shorter trip.
    /// <para>
    /// A dropped fix is never the baseline for the next one. Otherwise a single
    /// cell-tower fix 300 km away makes the next good fix look like an
    /// implausible jump too, and one bad reading takes the rest of the leg.
    /// </para>
    /// </remarks>
    public static CleanedTrack Clean(IReadOnlyList<Position> raw)
    {
        var kept = new List<Position>();
        var dropped = new List<DroppedFix>();

        foreach (var fix in raw)
        {
            var problem = ProblemWith(fix, kept.Count == 0 ? null : kept[^1]);
            if (problem is null)
            {
                kept.Add(fix);
            }
            else
            {
                dropped.Add(new DroppedFix(fix, problem.Value));
            }
        }

        return new CleanedTrack(kept, dropped);
    }

    /// <summary>
    /// Distance actually covered. The measured path, never the straight line —
    /// a detour a driver was made to take is distance they drove.
    /// </summary>
    public static long DistanceTravelled(CleanedTrack track) => PathLength(track.Kept);

    /// <summary>How much of the track survived cleaning, 0–1.</summary>
    /// <remarks>
    /// Reported alongside every figure derived from a track, for the same
    /// reason Grid reports supply coverage: a distance computed from 30% of
    /// the fixes is not wrong, but nobody should be shown it without knowing.
    /// </remarks>
    public static double FixQuality(CleanedTrack track)
    {
        var total = track.Kept.Count + track.Dropped.Count;
        return total == 0 ? 0 : (double)track.Kept.Count / total;
    }

    private static double ToRad(double degrees) => degrees * Math.PI / 180;
}
