using System.Globalization;

namespace Backhaul.Domain.Money;

/// <summary>An amount in kobo. 100 kobo = ₦1.</summary>
/// <remarks>
/// <para>
/// Integers, for the same reason the TypeScript domain uses them: a rounding
/// error in a figure somebody has to defend is a rounding error somebody has
/// to defend. See ADR-0004.
/// </para>
/// <para>
/// A readonly record struct rather than a bare <c>long</c>, so passing a naira
/// figure where kobo is expected does not compile. That mistake is a factor of
/// a hundred and no test catches it unless the numbers happen to be checked.
/// </para>
/// </remarks>
public readonly record struct Kobo(long Value) : IComparable<Kobo>
{
    public static readonly Kobo Zero = new(0);

    /// <summary>Kobo per naira, and the unit every displayed figure is rounded to.</summary>
    public const int SettlementUnit = 100;

    public const string Naira = "₦";

    /// <summary>Naira to kobo, rounded.</summary>
    /// <remarks>
    /// <see cref="MidpointRounding.AwayFromZero"/> throughout this type. .NET's
    /// default is banker's rounding, which disagrees with the TypeScript side
    /// on every half — a difference of one kobo, always in the same direction.
    /// The parity fixtures exist to catch exactly this.
    /// </remarks>
    public static Kobo FromNaira(decimal naira) =>
        new((long)Math.Round(naira * 100m, MidpointRounding.AwayFromZero));

    public static Kobo operator +(Kobo a, Kobo b) => new(a.Value + b.Value);

    public static Kobo operator -(Kobo a, Kobo b) => new(a.Value - b.Value);

    public static Kobo operator -(Kobo a) => new(-a.Value);

    public static bool operator <(Kobo a, Kobo b) => a.Value < b.Value;

    public static bool operator >(Kobo a, Kobo b) => a.Value > b.Value;

    public static bool operator <=(Kobo a, Kobo b) => a.Value <= b.Value;

    public static bool operator >=(Kobo a, Kobo b) => a.Value >= b.Value;

    public int CompareTo(Kobo other) => Value.CompareTo(other.Value);

    /// <summary>Multiplies by a factor and rounds back to whole kobo.</summary>
    public Kobo Scale(double factor) =>
        new((long)Math.Round(Value * factor, MidpointRounding.AwayFromZero));

    /// <summary>A percentage of this amount, in whole kobo, rounded half away from zero.</summary>
    /// <remarks>
    /// Away from zero on both sides, so a commission on a refund is the same
    /// size as the commission on the charge.
    /// </remarks>
    public Kobo Percent(int pct)
    {
        var exact = (decimal)Value * pct / 100m;
        return new((long)Math.Round(exact, MidpointRounding.AwayFromZero));
    }

    /// <summary>Rounds to a step a human would actually say.</summary>
    /// <remarks>
    /// Indicative figures only. A range of "₦1,861,487 – ₦2,678,725" is
    /// arithmetic pretending to be a quote: every digit after the first three
    /// is precision the estimate does not have. Found by looking at a rendered
    /// screen rather than by a test, which is where this class of defect
    /// always turns up.
    /// </remarks>
    public Kobo RoundTo(long stepKobo) =>
        stepKobo <= 0
            ? this
            : new((long)Math.Round((decimal)Value / stepKobo, MidpointRounding.AwayFromZero) * stepKobo);

    /// <summary>Rounds to the naira, so displayed lines add up to each other.</summary>
    public Kobo ToWholeNaira() =>
        new((long)Math.Round(Value / 100m, MidpointRounding.AwayFromZero) * 100);

    /// <summary>Formats for display: <c>₦1,250,000</c>. Whole naira, always.</summary>
    /// <remarks>
    /// No haulage invoice in Nigeria is settled to the kobo, and showing kobo
    /// implies a precision the negotiation never had.
    /// </remarks>
    public override string ToString() =>
        Naira + Math.Round(Value / 100m, MidpointRounding.AwayFromZero)
            .ToString("N0", CultureInfo.InvariantCulture);
}
