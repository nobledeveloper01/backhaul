using System.Globalization;
using System.Text;
using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Domain.Trips;

namespace Backhaul.Domain.Market;

/// <summary>A trip as a filter sees it.</summary>
public sealed record TripSummary(
    Guid Id,
    string Reference,
    TripState State,
    string Origin,
    string Destination,
    string Cargo,
    string TruckPlate,
    string DriverName,
    DateTimeOffset StartedAt,
    bool HasOpenIncident,
    bool IsLate);

public sealed record TripFilter(
    string Text,
    IReadOnlyList<TripState> States,
    bool OnlyLate,
    bool OnlyWithIncidents,
    DateTimeOffset? Since,
    DateTimeOffset? Until);

/// <summary>A load as a filter sees it.</summary>
public sealed record LoadSummary(
    Guid Id,
    string Origin,
    string Destination,
    string Cargo,
    double WeightKg,
    Kobo Offered,
    DateTimeOffset ReadyFrom,
    TruckClass TruckClass,
    // The shipper's standing, or null when nobody has established one.
    //
    // Null because this product has no shipper ladder yet. `Trust` is
    // carrier-shaped — a licence, goods-in-transit cover, punctuality — and
    // none of that is what makes a shipper worth working for. That is whether
    // they pay, and on time, which is a different set of requirements nobody
    // has written. This used to be filled with the literal "verified".
    string? ShipperTier);

public sealed record LoadFilter(
    string Text,
    IReadOnlyList<TruckClass> TruckClasses,
    Kobo? MinimumOffer,
    DateTimeOffset? ReadyBefore,
    IReadOnlyList<string> Tiers);

/// <summary>
/// Finding one trip among two hundred, and one load among a thousand.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/search.ts</c>.
/// </remarks>
public static class Search
{
    /// <summary>
    /// Case- and accent-insensitive, whitespace-tolerant containment.
    /// </summary>
    /// <remarks>
    /// Plates are written <c>T-12345</c>, <c>T 12345</c> and <c>t12345</c> by
    /// three different people about the same truck, and a search that finds
    /// none of them is a search nobody uses twice.
    /// </remarks>
    public static bool Matches(string haystack, string needle) =>
        Flatten(haystack).Contains(Flatten(needle), StringComparison.Ordinal);

    private static string Flatten(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var kept = new StringBuilder(decomposed.Length);

        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsAsciiLetterOrDigit(ch)) kept.Append(char.ToLowerInvariant(ch));
        }

        return kept.ToString();
    }

    /// <summary>
    /// Whether a filter would change anything.
    /// </summary>
    /// <remarks>
    /// Used to decide whether to show the "clear" affordance. A filter chip row
    /// that is always visible teaches people to ignore it, and then somebody
    /// spends ten minutes convinced their trips have vanished.
    /// </remarks>
    public static bool IsFiltering(TripFilter filter) =>
        filter.Text.Trim().Length > 0 ||
        filter.States.Count > 0 ||
        filter.OnlyLate ||
        filter.OnlyWithIncidents ||
        filter.Since is not null ||
        filter.Until is not null;

    public static IReadOnlyList<TripSummary> FilterTrips(
        IReadOnlyList<TripSummary> trips,
        TripFilter filter)
    {
        var text = filter.Text.Trim();

        return trips.Where(trip =>
        {
            if (filter.States.Count > 0 && !filter.States.Contains(trip.State)) return false;
            if (filter.OnlyLate && !trip.IsLate) return false;
            if (filter.OnlyWithIncidents && !trip.HasOpenIncident) return false;
            if (filter.Since is { } since && trip.StartedAt < since) return false;
            if (filter.Until is { } until && trip.StartedAt > until) return false;

            if (text.Length == 0) return true;

            return Matches(trip.Reference, text)
                   || Matches(trip.Origin, text)
                   || Matches(trip.Destination, text)
                   || Matches(trip.Cargo, text)
                   || Matches(trip.TruckPlate, text)
                   || Matches(trip.DriverName, text);
        }).ToList();
    }

    /// <summary>
    /// The filter, as a sentence.
    /// </summary>
    /// <remarks>
    /// A row of chips tells somebody <em>that</em> a filter is on; a sentence
    /// tells them <em>which</em>, and the difference matters when the answer on
    /// screen is "no trips".
    /// </remarks>
    public static string DescribeTripFilter(TripFilter filter)
    {
        var parts = new List<string>();

        if (filter.Text.Trim().Length > 0) parts.Add($"matching \"{filter.Text.Trim()}\"");

        if (filter.States.Count > 0)
        {
            parts.Add(string.Join(", ", filter.States.Select(TripMachine.ToWire)).Replace('_', ' '));
        }

        if (filter.OnlyLate) parts.Add("running late");
        if (filter.OnlyWithIncidents) parts.Add("with an open incident");

        // The dates were missing from this sentence and present in
        // `IsFiltering`. A shipper who narrowed to "since Monday" saw "All
        // trips" above a list that was plainly not all of them.
        if (filter.Since is { } since) parts.Add($"from {DayAndMonth(since)}");
        if (filter.Until is { } until) parts.Add($"up to {DayAndMonth(until)}");

        return parts.Count == 0 ? "All trips" : $"Trips {string.Join(", ", parts)}";
    }

    /// <summary>"04/03". Figures rather than a month name: four languages.</summary>
    private static string DayAndMonth(DateTimeOffset when) =>
        $"{when.UtcDateTime.Day:D2}/{when.UtcDateTime.Month:D2}";

    public static IReadOnlyList<LoadSummary> FilterLoads(
        IReadOnlyList<LoadSummary> loads,
        LoadFilter filter)
    {
        var text = filter.Text.Trim();

        return loads.Where(load =>
        {
            if (filter.TruckClasses.Count > 0 && !filter.TruckClasses.Contains(load.TruckClass))
            {
                return false;
            }

            if (filter.MinimumOffer is { } floor && load.Offered.Value < floor.Value) return false;
            if (filter.ReadyBefore is { } before && load.ReadyFrom > before) return false;
            // An unestablished standing matches no tier filter. Excluded
            // rather than admitted: a carrier who asked for Trusted shippers
            // and got everybody has been told something false about all of
            // them.
            if (filter.Tiers.Count > 0
                && (load.ShipperTier is null || !filter.Tiers.Contains(load.ShipperTier)))
            {
                return false;
            }

            if (text.Length == 0) return true;

            return Matches(load.Origin, text)
                   || Matches(load.Destination, text)
                   || Matches(load.Cargo, text);
        }).ToList();
    }

    /// <summary>
    /// What to say when a filter finds nothing.
    /// </summary>
    /// <remarks>
    /// Names the narrowest condition rather than saying "no results", because
    /// the useful next action is to relax <em>that one</em>. An empty state
    /// that does not say what to change is a dead end.
    /// </remarks>
    public static string WhyNothing(LoadFilter filter)
    {
        if (filter.MinimumOffer is not null) return "No loads at that price. Try a lower figure.";
        if (filter.TruckClasses.Count > 0) return "No loads for that truck. Try another class.";
        if (filter.ReadyBefore is not null) return "No loads ready by then. Try a later date.";
        if (filter.Tiers.Count > 0) return "No loads from shippers at that level yet.";
        if (filter.Text.Trim().Length > 0) return $"Nothing matching \"{filter.Text.Trim()}\".";
        return "No loads on the board right now.";
    }
}
