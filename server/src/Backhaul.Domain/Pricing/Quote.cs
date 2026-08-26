using Backhaul.Domain.Money;

namespace Backhaul.Domain.Pricing;

/// <summary>An indicative range for moving a truck over a distance.</summary>
/// <remarks>
/// A range, never a single number. A single number reads as a price, and this
/// is the middle of a distribution that diesel moves every few weeks.
/// <see cref="IsIndicative"/> is always true and is on the record so nothing
/// can render the figure without it.
/// </remarks>
public sealed record Quote(Kobo Low, Kobo Mid, Kobo High, bool AtMinimum, string Basis)
{
    public bool IsIndicative => true;

    /// <summary>Prices a truck against a road.</summary>
    /// <remarks>
    /// Weight is not a parameter, and that is the model rather than an
    /// omission: a half-empty trailer costs a full trailer to move. Weight
    /// decides the class — see <see cref="Trucks.SmallestFor"/> — and stops
    /// mattering there.
    /// </remarks>
    public static Quote For(TruckClass truck, int distanceMetres)
    {
        var km = Math.Max(0, distanceMetres) / 1000.0;

        var rate = Rates.PerKm[truck];
        var byDistance = rate.Scale(km);
        var floor = Rates.MinimumFare[truck];

        var atMinimum = byDistance < floor;
        var mid = atMinimum ? floor : byDistance;

        var basis = atMinimum
            ? $"Minimum fare for a {Trucks.ToWire(truck).Replace('_', ' ')}; the distance " +
              "alone prices below what the trip costs to run."
            : $"{Math.Round(km)} km at {rate} a kilometre.";

        return new Quote(
            mid.Scale(1 - Rates.Spread),
            mid,
            mid.Scale(1 + Rates.Spread),
            atMinimum,
            basis);
    }
}
