using Backhaul.Domain.Trips;

namespace Backhaul.Domain.Money;

public enum MilestoneKind
{
    Advance,
    InTransit,
    Delivered,
    Retention,
}

/// <summary>One step of the release schedule.</summary>
public sealed record Milestone(MilestoneKind Kind, int Pct, string Condition);

/// <summary>What the platform knows when a release is being decided.</summary>
public sealed record EscrowConditions(
    TripState State,
    long MovingForMs,
    bool PodSealed,
    DateTimeOffset? DeliveredAt,
    bool ExceptionRaised);

/// <summary>A milestone, what it is worth on this trip, and whether it has been met.</summary>
public sealed record Release(Milestone Milestone, Kobo Amount, bool Met);

/// <summary>
/// When the money moves.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/escrow.ts</c>. Every condition reads
/// something the tracker, the trip machine or the proof engine produced —
/// never an opinion. A milestone that releases on a phone call is a milestone
/// that releases on an argument.
/// </remarks>
public static class Escrow
{
    /// <summary>How long the retention is held.</summary>
    public static readonly int RetentionDays = 7;

    /// <summary>Six hours of arriving positions before the second milestone releases.</summary>
    public static readonly long InTransitMs = 6 * 60 * 60_000L;

    public static readonly IReadOnlyList<Milestone> Schedule =
    [
        new(MilestoneKind.Advance, 30, "The truck reached the depot and loading started."),
        new(MilestoneKind.InTransit, 20, "The trip has been moving with positions arriving for six hours."),
        new(MilestoneKind.Delivered, 40, "Proof of delivery captured: photographs, a signature and a name."),
        new(MilestoneKind.Retention, 10, "Seven days after delivery with no exception raised."),
    ];

    public static bool IsMet(MilestoneKind kind, EscrowConditions conditions, DateTimeOffset now)
    {
        var started = conditions.State != TripState.Open && conditions.State != TripState.Assigned;

        switch (kind)
        {
            case MilestoneKind.Advance:
                return started;

            case MilestoneKind.InTransit:
                return started && conditions.MovingForMs >= InTransitMs;

            // Not the `delivered` state — the *proof*. A state is a claim
            // somebody made; the proof is photographs, a signature and a
            // position.
            case MilestoneKind.Delivered:
                return conditions.PodSealed;

            case MilestoneKind.Retention:
            {
                if (conditions.DeliveredAt is not { } delivered || !conditions.PodSealed) return false;
                // An open exception holds the retention. That is the entire
                // reason it exists, and releasing it on a timer regardless
                // would make it theatre.
                if (conditions.ExceptionRaised) return false;
                var elapsed = (now - delivered).TotalMilliseconds;
                return elapsed >= RetentionDays * 86_400_000L;
            }

            default:
                return false;
        }
    }

    /// <summary>Every milestone, met or not, with what each is worth.</summary>
    /// <remarks>
    /// A schedule that showed only what has been released would answer "how
    /// much have I had" and never "when do I get the rest", which is the
    /// question a carrier is actually asking.
    /// </remarks>
    public static IReadOnlyList<Release> For(Kobo agreed, EscrowConditions conditions, DateTimeOffset now) =>
        Schedule
            .Select(milestone => new Release(
                milestone,
                agreed.Percent(milestone.Pct),
                IsMet(milestone.Kind, conditions, now)))
            .ToList();

    public static Kobo Released(IReadOnlyList<Release> releases) =>
        releases.Where(r => r.Met).Aggregate(Kobo.Zero, (total, r) => total + r.Amount);

    public static Kobo HeldBack(Kobo agreed, IReadOnlyList<Release> releases) =>
        agreed - Released(releases);

    /// <summary>The next thing that has to happen for money to move, or null.</summary>
    public static Release? NextRelease(IReadOnlyList<Release> releases) =>
        releases.FirstOrDefault(r => !r.Met);

    /// <summary>
    /// Whether the schedule adds up.
    /// </summary>
    /// <remarks>
    /// Asserted rather than assumed: a schedule that sums to 95 quietly keeps
    /// 5% of every trip, and nobody would notice for months.
    /// </remarks>
    public static bool SumsTo100(IReadOnlyList<Milestone>? milestones = null) =>
        (milestones ?? Schedule).Sum(m => m.Pct) == 100;
}
