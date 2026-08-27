using Backhaul.Domain.Money;

namespace Backhaul.Domain.Trips;

/// <summary>One delivery on a multi-drop trip.</summary>
public sealed record Drop(
    Guid Id,
    string Consignee,
    string Goods,
    int? Units,
    double WeightKg,
    int Sequence,
    DateTimeOffset? DeliveredAt);

/// <summary>
/// One truck, several deliveries.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/drops.ts</c>. Treating a four-market run as
/// four trips gets the arithmetic wrong in both directions — four minimum
/// fares for one run, and four separate demurrage clocks on a truck that only
/// waited once.
/// </remarks>
public static class Drops
{
    /// <summary>
    /// What each extra stop adds to the fare.
    /// </summary>
    /// <remarks>
    /// ₦25,000, flat rather than a percentage: the cost of stopping does not
    /// scale with what is on the truck. A platform that prices four drops as
    /// one delivery is a platform hauliers price around by refusing multi-drop
    /// work.
    /// </remarks>
    public static readonly Kobo PerDrop = Kobo.FromNaira(25_000);

    /// <summary>
    /// What the drops add to the fare.
    /// </summary>
    /// <remarks>
    /// The <b>first</b> drop is the delivery; every one after it is an extra.
    /// A trip with one drop costs what a trip has always cost, which is what
    /// keeps this from being a price rise wearing a feature's clothes.
    /// </remarks>
    public static Kobo Fee(int drops) => new(PerDrop.Value * Math.Max(0, drops - 1));

    /// <summary>Weight still aboard. What a weighbridge will read.</summary>
    public static double WeightAboard(IReadOnlyList<Drop> drops) =>
        drops.Where(d => d.DeliveredAt is null).Sum(d => d.WeightKg);

    /// <summary>
    /// Whether the trip may close.
    /// </summary>
    /// <remarks>
    /// On the last signature, not on arriving at the last address. A truck can
    /// be at the final market with goods still aboard, and a trip that closes
    /// on geography closes on the wrong thing.
    /// </remarks>
    public static bool IsComplete(IReadOnlyList<Drop> drops) =>
        drops.Count > 0 && drops.All(d => d.DeliveredAt is not null);

    /// <summary>
    /// Drops signed for while an earlier one was still aboard.
    /// </summary>
    /// <remarks>
    /// Recorded, not refused. A consignee who was closed is a real thing and a
    /// driver who comes back tomorrow is doing the sensible thing — but
    /// "delivered in the order loaded" is otherwise assumed by everybody
    /// reading the document afterwards.
    /// </remarks>
    public static IReadOnlyList<Drop> OutOfOrder(IReadOnlyList<Drop> drops)
    {
        var ordered = drops.OrderBy(d => d.Sequence).ToList();
        var found = new List<Drop>();

        for (var i = 0; i < ordered.Count; i++)
        {
            if (ordered[i].DeliveredAt is null) continue;
            if (ordered.Take(i).Any(earlier => earlier.DeliveredAt is null))
            {
                found.Add(ordered[i]);
            }
        }

        return found;
    }
}
