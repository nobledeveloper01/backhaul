using Backhaul.Domain.Pricing;

namespace Backhaul.Domain.Money;

/// <summary>What a run is going to cost before it is accepted.</summary>
public sealed record CostInput(
    TruckClass Truck,
    double LadenM,
    double EmptyM,
    Kobo DieselPerLitre,
    Kobo Levies,
    Kobo Other);

public sealed record Costs(Kobo Fuel, Kobo Running, Kobo Levies, Kobo Other, Kobo Total, int Litres);

public sealed record Margin(Kobo Revenue, Costs Costs, Kobo Profit, double? Fraction);

public sealed record Advice(bool Take, string Detail);

/// <summary>
/// What the road costs the carrier.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/costs.ts</c>. The figures are real for these
/// classes on Nigerian roads rather than manufacturer numbers — a loaded
/// 30-tonne trailer on the Kaduna road does not do what the brochure says.
/// </remarks>
public static class CostModel
{
    /// <summary>Litres per 100 km, laden, on a mixed corridor.</summary>
    public static readonly IReadOnlyDictionary<TruckClass, double> LitresPer100Km =
        new Dictionary<TruckClass, double>
        {
            [TruckClass.Pickup] = 12,
            [TruckClass.Canter] = 22,
            [TruckClass.Truck15t] = 32,
            [TruckClass.Trailer30t] = 45,
            [TruckClass.Lowbed] = 52,
        };

    /// <summary>An empty truck burns about three quarters of what a loaded one does.</summary>
    public static readonly double EmptyFuelFraction = 0.75;

    /// <summary>
    /// Everything that is not fuel, per kilometre.
    /// </summary>
    /// <remarks>
    /// Tyres, servicing, the driver's own pay, and the sinking fund a truck
    /// needs to be replaced. Per kilometre because that is how it accrues, and
    /// per class because a trailer's tyres are not a canter's.
    /// </remarks>
    public static readonly IReadOnlyDictionary<TruckClass, Kobo> RunningPerKm =
        new Dictionary<TruckClass, Kobo>
        {
            [TruckClass.Pickup] = new(4_000),
            [TruckClass.Canter] = new(7_500),
            [TruckClass.Truck15t] = new(11_000),
            [TruckClass.Trailer30t] = new(16_000),
            [TruckClass.Lowbed] = new(19_000),
        };

    /// <summary>
    /// The lowest fare worth taking, as a share of cost.
    /// </summary>
    /// <remarks>
    /// Costs plus a floor, because working for exactly cost is working for
    /// nothing and a truck that runs at cost cannot be replaced. 15% is
    /// deliberately modest: a floor for deciding, not a target for pricing.
    /// </remarks>
    public static readonly double FloorMargin = 0.15;

    public static Costs RunningCost(CostInput input)
    {
        var laden = input.LadenM / 1_000d;
        var empty = input.EmptyM / 1_000d;
        var perHundred = LitresPer100Km[input.Truck];

        var litres = laden * perHundred / 100d + empty * perHundred * EmptyFuelFraction / 100d;

        var fuel = new Kobo((long)Math.Round(litres * input.DieselPerLitre.Value, MidpointRounding.AwayFromZero));
        var running = new Kobo((long)Math.Round(
            (laden + empty) * RunningPerKm[input.Truck].Value,
            MidpointRounding.AwayFromZero));

        return new Costs(
            fuel,
            running,
            input.Levies,
            input.Other,
            fuel + running + input.Levies + input.Other,
            (int)Math.Round(litres, MidpointRounding.AwayFromZero));
    }

    public static Margin MarginOn(Kobo revenue, CostInput input)
    {
        var costs = RunningCost(input);
        var profit = revenue - costs.Total;

        return new Margin(
            revenue,
            costs,
            profit,
            revenue.Value == 0 ? null : (double)profit.Value / revenue.Value);
    }

    public static Kobo WalkAwayBelow(CostInput input) =>
        new((long)Math.Round(RunningCost(input).Total.Value / (1 - FloorMargin), MidpointRounding.AwayFromZero));

    /// <summary>
    /// Whether to take it, and why in one sentence.
    /// </summary>
    /// <remarks>
    /// The sentence matters more than the boolean: a carrier told "no" with no
    /// figure attached will take the load anyway and find out afterwards.
    /// </remarks>
    public static Advice Advise(Kobo offered, CostInput input)
    {
        var found = MarginOn(offered, input);
        var floor = WalkAwayBelow(input);

        if (found.Profit.Value <= 0)
        {
            return new Advice(
                false,
                $"This loses money: {found.Costs.Litres} litres of diesel and " +
                "the running cost come to more than the fare.");
        }

        if (offered.Value < floor.Value)
        {
            return new Advice(false, "It covers the trip, but not enough to put anything back into the truck.");
        }

        // Away-from-zero is safe here only because this line is unreachable
        // with a negative fraction — the loss case returned above. JavaScript
        // rounds a negative half toward zero and .NET rounds it away, so if
        // this ever runs on a loss the two servers will differ by one point.
        return new Advice(
            true,
            $"About {(int)Math.Round((found.Fraction ?? 0) * 100, MidpointRounding.AwayFromZero)}% over what the run costs.");
    }
}
