using Backhaul.Domain.Money;
using Backhaul.Domain.Tracking;

namespace Backhaul.Domain.Market;

/// <summary>One paid leg of a chain.</summary>
public sealed record ChainLeg(
    Guid LoadId,
    Position From,
    Position To,
    string FromName,
    string ToName,
    DateTimeOffset ReadyFrom,
    DateTimeOffset? DeliverBy,
    Kobo Pays,
    double DistanceM);

public sealed record Chain(
    IReadOnlyList<ChainLeg> Legs,
    double DeadheadM,
    double Laden,
    Kobo Pays);

public enum ChainRefusal
{
    TooFar,
    TooTight,
    WrongOrder,
}

public abstract record Fit
{
    public sealed record Ok(double RepositionM) : Fit;

    public sealed record No(ChainRefusal Reason, string Detail) : Fit;
}

/// <summary>
/// Three loads instead of one, and the empty legs between them.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/chaining.ts</c>. Named <c>ChainLeg</c> rather
/// than <c>Leg</c> for the reason ADR-0011 gives.
/// </remarks>
public static class Chaining
{
    /// <summary>How far a truck will run empty to pick the next load up.</summary>
    public static readonly double MaxRepositionM = 120_000;

    /// <summary>45 km/h, door to door, which is what a Nigerian corridor gives.</summary>
    public static readonly double RepositionSpeedMs = 12.5;

    /// <summary>
    /// The slack a connection needs beyond the drive itself.
    /// </summary>
    /// <remarks>
    /// Three hours. Loading, paperwork, and the fact that the previous leg's
    /// delivery window is the *latest* it may arrive, not when it will.
    /// </remarks>
    public static readonly long ConnectionSlackMs = 3 * 60 * 60_000L;

    /// <summary>
    /// Chains longer than three legs are planning fiction: by the third
    /// handover the first leg's timings have moved.
    /// </summary>
    public static readonly int MaxChainLegs = 3;

    /// <summary>
    /// Whether one leg can follow another, with the reason when it cannot.
    /// </summary>
    /// <remarks>
    /// A reason rather than a boolean, so a carrier looking at a load that
    /// *nearly* fits is told which of the two things is wrong — the distance
    /// is something they might accept, and the timing is not.
    /// </remarks>
    public static Fit CanFollow(ChainLeg previous, ChainLeg next)
    {
        var reposition = (double)Geo.Distance(previous.To, next.From);

        if (reposition > MaxRepositionM)
        {
            return new Fit.No(
                ChainRefusal.TooFar,
                $"{Round(reposition / 1_000)} km empty from {previous.ToName} to {next.FromName}.");
        }

        // No deadline on the first leg means nothing can be said about the
        // connection. Allowed on distance alone; the carrier judges the rest.
        if (previous.DeliverBy is not { } previousEnds) return new Fit.Ok(reposition);

        if (next.ReadyFrom < previous.ReadyFrom)
        {
            return new Fit.No(
                ChainRefusal.WrongOrder,
                $"{next.FromName} loads before {previous.FromName} does.");
        }

        var earliestArrival = previousEnds
            .AddMilliseconds(reposition / RepositionSpeedMs * 1_000)
            .AddMilliseconds(ConnectionSlackMs);

        if (next.DeliverBy is { } due && earliestArrival > due)
        {
            return new Fit.No(
                ChainRefusal.TooTight,
                $"Too tight — {next.ToName} is due before the truck could get there.");
        }

        return new Fit.Ok(reposition);
    }

    // wired-check: reached only from Build() below, which the chaining parity
    // case does exercise, so the totals here are compared against TypeScript
    // on every run. Public because packages/domain exports summarise() and a
    // mirror that hides half its surface is a mirror nothing can be held to.
    /// <summary>Totals a chain: what it pays, what it drives laden, what it drives empty.</summary>
    public static Chain Summarise(IReadOnlyList<ChainLeg> legs)
    {
        double deadhead = 0;
        double laden = 0;
        var pays = Kobo.Zero;

        for (var i = 0; i < legs.Count; i++)
        {
            laden += legs[i].DistanceM;
            pays += legs[i].Pays;
            if (i > 0) deadhead += Geo.Distance(legs[i - 1].To, legs[i].From);
        }

        return new Chain(legs, deadhead, laden, pays);
    }

    /// <summary>
    /// The best chain that can be built from a starting leg and a pool.
    /// </summary>
    /// <remarks>
    /// Greedy: at each step take the leg that adds the most money per
    /// kilometre driven, including the empty ones. Greedy rather than optimal
    /// on purpose — the pool a carrier sees is a few dozen loads, an optimal
    /// search is a travelling-salesman problem, and being approximately right
    /// instantly is worth more than being exactly right after a spinner.
    /// </remarks>
    public static Chain Build(ChainLeg start, IReadOnlyList<ChainLeg> pool, int? maxChainLegs = null)
    {
        var limit = maxChainLegs ?? MaxChainLegs;
        var chosen = new List<ChainLeg> { start };
        var taken = new HashSet<Guid> { start.LoadId };

        while (chosen.Count < limit)
        {
            var last = chosen[^1];
            ChainLeg? best = null;
            double bestValue = 0;

            foreach (var candidate in pool)
            {
                if (taken.Contains(candidate.LoadId)) continue;
                if (CanFollow(last, candidate) is not Fit.Ok fit) continue;

                var driven = candidate.DistanceM + fit.RepositionM;
                if (driven == 0) continue;
                var value = candidate.Pays.Value / driven;

                if (best is null || value > bestValue)
                {
                    best = candidate;
                    bestValue = value;
                }
            }

            if (best is null) break;
            chosen.Add(best);
            taken.Add(best.LoadId);
        }

        return Summarise(chosen);
    }

    /// <summary>
    /// What fraction of a chain's kilometres are paid for.
    /// </summary>
    /// <remarks>
    /// The number the whole feature exists to move, and deliberately the same
    /// shape as utilisation so a carrier can compare a proposed chain against
    /// what they actually ran last month.
    /// </remarks>
    public static double LadenFraction(Chain chain)
    {
        var total = chain.Laden + chain.DeadheadM;
        return total == 0 ? 0 : chain.Laden / total;
    }

    /// <summary>JavaScript's <c>Math.round</c>. See <see cref="Matching"/>.</summary>
    private static double Round(double value) => Math.Floor(value + 0.5);
}
