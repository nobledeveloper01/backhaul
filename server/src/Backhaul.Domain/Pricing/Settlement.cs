using Backhaul.Domain.Money;

namespace Backhaul.Domain.Pricing;

public sealed record Demurrage(int ChargeableHours, Kobo Amount, string Basis)
{
    /// <summary>What the waiting cost.</summary>
    /// <remarks>
    /// Part-hours round <em>up</em>, deliberately: the truck is unavailable for
    /// the whole hour it is sitting in, and rounding down would make a
    /// fifty-minute delay free.
    /// </remarks>
    public static Demurrage For(TruckClass truck, TimeSpan waited)
    {
        var chargeable = waited - Rates.FreeWaiting;
        if (chargeable <= TimeSpan.Zero)
        {
            return new Demurrage(
                0,
                Kobo.Zero,
                $"Within the {Rates.FreeWaiting.TotalHours} free hours.");
        }

        var hours = (int)Math.Ceiling(chargeable.TotalHours);
        var rate = Rates.DemurragePerHour[truck];
        return new Demurrage(
            hours,
            rate.Scale(hours),
            $"{hours} h beyond the free window at {rate} an hour.");
    }
}

/// <summary>What each party ends up with.</summary>
/// <remarks>
/// <para>
/// A statement, not a payment. Backhaul does not hold money — the product
/// statement is explicit that this is not a payments or escrow business. This
/// exists so both sides read the same figures; they settle directly.
/// </para>
/// <para>
/// Commission is taken on the agreed fare only, never on demurrage. Demurrage
/// compensates a delay Backhaul did not cause and did not resolve, and taking
/// a cut of it would mean the platform earns more the worse the trip goes.
/// </para>
/// </remarks>
public sealed record Settlement(
    Kobo Agreed,
    Kobo Demurrage,
    Kobo Gross,
    Kobo Commission,
    Kobo Advance,
    Kobo ToCarrier)
{
    public static Settlement Of(Kobo agreed, Kobo demurrage, Kobo advance)
    {
        var gross = agreed + demurrage;

        // Whole naira, so every displayed line adds up to every other. Grid
        // found the opposite of this on a rendered page rather than in a test:
        // shares allocated to the kobo are arithmetically correct and visibly
        // do not add up beside a claim that they balance.
        var commission = agreed.Percent(Rates.CommissionPct).ToWholeNaira();

        return new Settlement(
            agreed,
            demurrage,
            gross,
            commission,
            advance,
            gross - commission - advance);
    }
}
