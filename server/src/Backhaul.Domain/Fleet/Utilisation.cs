using Backhaul.Domain.Money;

namespace Backhaul.Domain.Fleet;

/// <summary>One stretch a truck actually drove.</summary>
/// <param name="Metres">Distance actually driven, from a cleaned track.</param>
/// <param name="Loaded">False when the truck was running empty — repositioning, or going home.</param>
/// <param name="Earned">What the leg earned. Zero for an empty one, by definition.</param>
public sealed record Leg(double Metres, bool Loaded, Kobo Earned);

/// <summary>What a window of driving came to.</summary>
/// <param name="LoadedMetres">Metres driven with something on the trailer.</param>
/// <param name="EmptyMetres">Metres driven with nothing on it.</param>
/// <param name="TotalMetres">The two together — the diesel bill's denominator.</param>
/// <param name="Ratio">Loaded share of distance driven, 0–1.</param>
/// <param name="Earned">What the loaded legs paid.</param>
/// <param name="PerKmDriven">
/// Naira per kilometre <em>driven</em>, not per kilometre paid. The honest
/// version of a rate: a haulier quoting ₦2,700 a kilometre who runs half of
/// them empty is really earning ₦1,350, and this is the figure that says so.
/// </param>
/// <param name="Legs">How many legs went into it, so a thin sample can be labelled.</param>
public sealed record UtilisationResult(
    double LoadedMetres,
    double EmptyMetres,
    double TotalMetres,
    double Ratio,
    Kobo Earned,
    Kobo PerKmDriven,
    int Legs);

/// <summary>
/// How much of a fleet's driving is paid for.
/// </summary>
/// <remarks>
/// <para>
/// The number the product exists to move. A truck that runs 830 km loaded and
/// 830 km empty is at 50% utilisation, and every point of that is diesel,
/// tyres and a driver's day paid for by nothing.
/// </para>
/// <para>Mirrors <c>packages/domain/src/utilisation.ts</c>.</para>
/// </remarks>
public static class Utilisation
{
    /// <summary>Below this many legs, the figure is not worth presenting as a trend.</summary>
    public static readonly int MinimumLegs = 4;

    /// <summary>
    /// Projections round to ₦5,000, like every other indicative figure.
    /// </summary>
    private const long IndicativeStep = 500_000;

    public static UtilisationResult Of(IReadOnlyList<Leg> legs)
    {
        double loadedMetres = 0;
        double emptyMetres = 0;
        var earned = Kobo.Zero;

        foreach (var leg in legs)
        {
            if (leg.Loaded)
            {
                loadedMetres += leg.Metres;
                earned += leg.Earned;
            }
            else
            {
                emptyMetres += leg.Metres;
            }
        }

        var totalMetres = loadedMetres + emptyMetres;

        return new UtilisationResult(
            loadedMetres,
            emptyMetres,
            totalMetres,
            // Zero rather than NaN. A fleet with no legs is at 0% utilisation,
            // and a screen rendering "NaN%" is worse than one rendering a
            // truthful nothing.
            totalMetres == 0 ? 0 : loadedMetres / totalMetres,
            earned,
            totalMetres == 0
                ? Kobo.Zero
                : new Kobo(HalfUp(earned.Value / (totalMetres / 1000))),
            legs.Count);
    }

    /// <summary>
    /// What one more loaded return leg would be worth.
    /// </summary>
    /// <remarks>
    /// The whole pitch, as a number. Returns null below <see cref="MinimumLegs"/>,
    /// or with no empty running at all — a projection from two legs is a guess
    /// with a decimal point on it.
    /// </remarks>
    public static Kobo? WorthOfOneReturnLeg(UtilisationResult current, double averageLegMetres)
    {
        if (current.Legs < MinimumLegs) return null;
        if (current.EmptyMetres == 0) return null;
        if (current.LoadedMetres == 0) return null;

        var ratePerKmLoaded = current.Earned.Value / (current.LoadedMetres / 1000);
        var km = Math.Min(averageLegMetres, current.EmptyMetres) / 1000;

        return new Kobo(HalfUp(ratePerKmLoaded * km)).RoundTo(IndicativeStep);
    }

    /// <summary>"62% loaded" — the one figure, formatted.</summary>
    public static string DescribeRatio(UtilisationResult current) =>
        $"{HalfUp(current.Ratio * 100)}% loaded";

    /// <summary>"₦1,350 a kilometre driven" — the honest rate, formatted.</summary>
    public static string DescribeRate(UtilisationResult current) =>
        $"{current.PerKmDriven} a kilometre driven";

    /// <summary>
    /// JavaScript's <c>Math.round</c>, which is half <em>up</em> and not half
    /// away from zero.
    /// </summary>
    /// <remarks>
    /// The two agree on every figure here, because distances and earnings are
    /// non-negative. Written this way anyway: the parity fixtures are
    /// generated from the TypeScript, and a mirror that copies the rule rather
    /// than a rule that happens to match is the one that survives somebody
    /// later feeding it a credit note.
    /// </remarks>
    private static long HalfUp(double value) => (long)Math.Floor(value + 0.5);
}
