namespace Backhaul.Domain.Trips;

public enum EvidenceKind
{
    TripEvent,
    Position,
    DiscardedPosition,
    Message,
    Incident,
    Photo,
    Signature,
    WaypointVisit,
    ShareLink,
}

public enum EvidenceSource
{
    Shipper,
    Carrier,
    Driver,
    System,
}

/// <summary>
/// How much weight an item can carry.
/// </summary>
/// <remarks>
/// Not a score and not a probability — three named tiers, because "0.72
/// confidence" on a photograph is a number nobody can defend in an argument.
/// </remarks>
public enum Weight
{
    /// <summary>Produced by the tracker or the server. Neither party wrote it.</summary>
    Measured,

    /// <summary>Produced by a person, timestamped by the server on arrival.</summary>
    Attested,

    /// <summary>Produced by a person and delivered much later than it was written.</summary>
    LateAttested,
}

/// <summary>One thing that happened, and when it arrived.</summary>
/// <param name="Kind">What sort of thing it is.</param>
/// <param name="At">When it happened, as claimed by whoever produced it.</param>
/// <param name="Until">
/// When it stopped happening, for anything that spans time.
/// <para>
/// A run of position fixes is an <em>interval</em>, not an instant. Treating it
/// as an instant made the gap finder report a hole between every pair of
/// consecutive items — a trip with continuous coverage came out as nine gaps
/// totalling fifty-one hours, which is the opposite of what the record said.
/// </para>
/// </param>
/// <param name="ReceivedAt">
/// When the server took it. Null for anything the server produced itself; the
/// gap between the two is how a late report is told from a late delivery.
/// </param>
/// <param name="Summary">One line, for the rendered pack.</param>
/// <param name="Source">Who or what produced it.</param>
public sealed record Evidence(
    EvidenceKind Kind,
    DateTimeOffset At,
    DateTimeOffset? Until,
    DateTimeOffset? ReceivedAt,
    string Summary,
    EvidenceSource Source);

public sealed record WeighedEvidence(Evidence Item, Weight Weight);

public sealed record Gap(DateTimeOffset From, DateTimeOffset To, long Ms);

public sealed record Pack(
    Guid TripId,
    DateTimeOffset AssembledAt,
    IReadOnlyList<WeighedEvidence> Items,
    IReadOnlyDictionary<Weight, int> Counts,
    IReadOnlyList<Gap> Gaps,
    long CoveredMs);

/// <summary>
/// The bundle a disagreement is argued from.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/dispute.ts</c>. One rule: <b>it adds nothing
/// and it decides nothing.</b> No summary, no fault, no "the evidence
/// suggests". It orders what happened and says how confident each item is, and
/// the humans do the rest — a platform that adjudicates its own disputes is a
/// platform both sides stop trusting.
/// </remarks>
public static class Dispute
{
    /// <summary>
    /// How long a gap between writing and arriving makes an item late.
    /// </summary>
    /// <remarks>
    /// Two hours. Long enough to cover an ordinary dead zone; short enough that
    /// a message written after the argument started and back-dated is visible
    /// as exactly that.
    /// </remarks>
    public static readonly long LateAfterMs = 2 * 60 * 60_000L;

    /// <summary>
    /// How long a stretch with nothing in it is worth naming.
    /// </summary>
    /// <remarks>
    /// Three hours. Shorter is a quiet afternoon; longer is a hole in the
    /// record, and a hole is the thing both sides will point at.
    /// </remarks>
    public static readonly long GapMs = 3 * 60 * 60_000L;

    /// <summary>The least tracked time a pack can hold and still be worth arguing from.</summary>
    public static readonly long MinimumCoveredMs = 2 * 60 * 60_000L;

    public static Weight Weigh(Evidence item)
    {
        if (item.Source == EvidenceSource.System) return Weight.Measured;
        if (item.ReceivedAt is not { } received) return Weight.Attested;

        var delay = (long)(received - item.At).TotalMilliseconds;
        return delay >= LateAfterMs ? Weight.LateAttested : Weight.Attested;
    }

    /// <summary>
    /// Assembles the pack.
    /// </summary>
    /// <remarks>
    /// Ordered by when things <em>happened</em>, not by when they arrived — the
    /// pack is a reconstruction of the trip, and sorting by arrival would put a
    /// driver's dead-zone message after the delivery it preceded.
    /// </remarks>
    public static Pack Assemble(
        Guid tripId,
        IReadOnlyList<Evidence> evidence,
        DateTimeOffset assembledAt)
    {
        var items = evidence
            .OrderBy(e => e.At)
            // Ties broken by arrival, so two things in the same minute keep
            // the order the server saw rather than an arbitrary one.
            .ThenBy(e => e.ReceivedAt ?? DateTimeOffset.UnixEpoch)
            .Select(e => new WeighedEvidence(e, Weigh(e)))
            .ToList();

        var counts = new Dictionary<Weight, int>
        {
            [Weight.Measured] = 0,
            [Weight.Attested] = 0,
            [Weight.LateAttested] = 0,
        };
        foreach (var item in items) counts[item.Weight]++;

        var coveredMs = items
            .Where(i => i.Item.Kind == EvidenceKind.Position)
            .Sum(i => (long)((i.Item.Until ?? i.Item.At) - i.Item.At).TotalMilliseconds);

        return new Pack(tripId, assembledAt, items, counts, Holes(items), coveredMs);
    }

    /// <summary>
    /// Stretches with nothing recorded, <em>while there was supposed to be</em>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Only positions constitute coverage. Weighing "measured" is not the same
    /// thing: a <c>signal_lost</c> event is measured — the tracker raised it,
    /// no party could have written it — and it is precisely the *absence* of
    /// coverage. Using measured items to bound the window started the clock at
    /// the first signal loss, sixteen hours before any position existed.
    /// </para>
    /// <para>
    /// A gap before the tracker started is not a gap. A trip is often open for
    /// a day before a truck loads: messages are exchanged, a bid is accepted,
    /// nothing is moving and nothing should be recorded.
    /// </para>
    /// </remarks>
    private static IReadOnlyList<Gap> Holes(IReadOnlyList<WeighedEvidence> items)
    {
        var covering = items.Where(i => i.Item.Kind == EvidenceKind.Position).ToList();
        if (covering.Count == 0) return [];

        var closes = covering[^1].Item.Until ?? covering[^1].Item.At;
        var found = new List<Gap>();
        var coveredTo = covering[0].Item.At;

        foreach (var entry in items)
        {
            var item = entry.Item;

            if (item.At <= coveredTo)
            {
                var ends = item.Until ?? item.At;
                if (ends > coveredTo) coveredTo = ends;
                continue;
            }

            if (item.At > closes) break;

            var ms = (long)(item.At - coveredTo).TotalMilliseconds;
            if (ms >= GapMs) found.Add(new Gap(coveredTo, item.At, ms));

            var after = item.Until ?? item.At;
            if (after > coveredTo) coveredTo = after;
        }

        return found;
    }

    /// <summary>
    /// One line describing what the pack contains.
    /// </summary>
    /// <remarks>
    /// Deliberately arithmetic rather than judgement: counts and hours, with no
    /// adjective anywhere. The moment this sentence contains "strong" or "weak"
    /// it is the platform taking a side.
    /// </remarks>
    public static string Describe(Pack pack)
    {
        var total = pack.Items.Count;
        if (total == 0) return "Nothing recorded on this trip.";

        var gapHours = (int)Math.Floor(pack.Gaps.Sum(g => g.Ms) / 3_600_000d + 0.5);
        var measured = pack.Counts[Weight.Measured];
        var late = pack.Counts[Weight.LateAttested];

        var parts = new List<string> { $"{total} items, {measured} of them measured by the tracker" };
        if (late > 0) parts.Add($"{late} reported late");
        if (gapHours > 0) parts.Add($"{gapHours} hours with nothing recorded");

        return string.Join("; ", parts) + ".";
    }

    /// <summary>
    /// Whether the pack is thin enough that somebody should be told before
    /// they rely on it.
    /// </summary>
    /// <remarks>
    /// Not "whether the claim is weak" — that is not this system's call.
    /// Measured in covered time rather than item count: counting items said a
    /// trip with two long unbroken runs had "not much here" while a badly
    /// tracked one with a dozen fragments looked healthy.
    /// </remarks>
    public static bool IsThin(Pack pack) =>
        pack.CoveredMs < MinimumCoveredMs || pack.Items.Count < 6;
}
