using Backhaul.Domain.Money;

namespace Backhaul.Domain.Pricing;

/// <summary>Indicative rates, the demurrage table, and the commission.</summary>
/// <remarks>
/// <para>
/// These figures are duplicated from <c>packages/domain/src/pricing.ts</c>, and
/// the duplication is the cost of the stack choice recorded in ADR-0005. The
/// parity fixtures assert they still match: a change on one side that is not
/// made on the other fails <c>ParityTests</c> rather than surfacing in a
/// disputed invoice.
/// </para>
/// <para>
/// Per kilometre <em>of truck</em>, not per tonne-kilometre. The first model
/// was tonne-km — correct arithmetic, green tests — and it quoted ₦398,400 for
/// a Lagos–Kano trailer run that goes for over two million naira. A haulier
/// quotes a truck against a road; tonnage decides which truck and nothing
/// after that.
/// </para>
/// <para>
/// <b>These are a starting point for a negotiation, not a tariff.</b> Rates
/// move with diesel, with the season, and with which way the truck is already
/// going — a Lagos-to-Kano load and the Kano-to-Lagos backhaul that follows it
/// are not the same price, and the product is named after that asymmetry.
/// </para>
/// </remarks>
public static class Rates
{
    public static readonly IReadOnlyDictionary<TruckClass, Kobo> PerKm =
        new Dictionary<TruckClass, Kobo>
        {
            [TruckClass.Pickup] = new(90_000),
            [TruckClass.Canter] = new(140_000),
            [TruckClass.Truck15t] = new(190_000),
            [TruckClass.Trailer30t] = new(270_000),
            [TruckClass.Lowbed] = new(420_000),
        };

    /// <summary>The cost of showing up: a truck, a driver and a day.</summary>
    public static readonly IReadOnlyDictionary<TruckClass, Kobo> MinimumFare =
        new Dictionary<TruckClass, Kobo>
        {
            [TruckClass.Pickup] = new(2_500_000),
            [TruckClass.Canter] = new(6_000_000),
            [TruckClass.Truck15t] = new(12_000_000),
            [TruckClass.Trailer30t] = new(35_000_000),
            [TruckClass.Lowbed] = new(60_000_000),
        };

    public static readonly IReadOnlyDictionary<TruckClass, Kobo> DemurragePerHour =
        new Dictionary<TruckClass, Kobo>
        {
            [TruckClass.Pickup] = new(150_000),
            [TruckClass.Canter] = new(300_000),
            [TruckClass.Truck15t] = new(500_000),
            [TruckClass.Trailer30t] = new(750_000),
            [TruckClass.Lowbed] = new(1_000_000),
        };

    /// <summary>
    /// Free waiting time at each end. Loading a trailer takes hours in a
    /// Nigerian depot and nobody bills for the first few; demurrage starts
    /// when a delay stops being normal.
    /// </summary>
    public static readonly TimeSpan FreeWaiting = TimeSpan.FromHours(4);

    /// <summary>What Backhaul takes, as a percentage of the agreed fare.</summary>
    public const int CommissionPct = 8;

    /// <summary>How far either side of the midpoint an indicative range runs.</summary>
    public const double Spread = 0.18;

    /// <summary>Indicative figures are rounded to ₦5,000.</summary>
    /// <remarks>
    /// A range is a statement about a distribution, and stating its edges to
    /// the naira claims a precision nothing here has. ₦5,000 is coarse enough
    /// to read as an estimate and fine enough to stay useful on a ₦25,000
    /// city run.
    /// </remarks>
    public const long IndicativeStep = 500_000;
}
