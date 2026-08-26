using System.Text.Json;
using System.Text.Json.Serialization;

namespace Backhaul.Domain.Tests;

/// <summary>
/// Loads <c>fixtures/parity.json</c>, generated from <c>packages/domain</c>.
/// </summary>
/// <remarks>
/// Found by walking up from the test binary rather than by a relative path,
/// because the working directory of a test run is not something to rely on and
/// a "file not found" here would read as a broken test rather than a missing
/// gate.
/// </remarks>
public static class Fixtures
{
    /// <summary>
    /// The shape version this suite understands. A mismatch fails loudly
    /// rather than silently reading a field that has moved.
    /// </summary>
    public const int ExpectedVersion = 1;

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    private static readonly Lazy<ParityFixtures> Loaded = new(Load);

    public static ParityFixtures Parity => Loaded.Value;

    private static ParityFixtures Load()
    {
        var path = Locate("fixtures/parity.json");
        var json = File.ReadAllText(path);
        var parsed = JsonSerializer.Deserialize<ParityFixtures>(json, Options)
                     ?? throw new InvalidOperationException($"{path} did not parse.");

        if (parsed.Version != ExpectedVersion)
        {
            throw new InvalidOperationException(
                $"{path} is version {parsed.Version}; this suite understands " +
                $"{ExpectedVersion}. Regenerate with `make fixtures` and update " +
                "the C# side to match the new shape.");
        }

        return parsed;
    }

    private static string Locate(string relative)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, relative);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        throw new FileNotFoundException(
            $"Could not find {relative} above {AppContext.BaseDirectory}. " +
            "Run `make fixtures` from the repository root.");
    }
}

public sealed record ParityFixtures(
    int Version,
    ParityConstants Constants,
    TripFixtures Trip,
    PricingFixtures Pricing,
    TrackingFixtures Tracking);

public sealed record ParityConstants(
    int CommissionPct,
    long FreeWaitingMs,
    Dictionary<string, long> RatePerKm,
    Dictionary<string, long> MinimumFare,
    double MaxUsefulAccuracyM,
    double MaxPlausibleSpeedMs,
    long SignalLostAfterMs,
    long StalledAfterMs,
    long StallRadiusM);

public sealed record TripFixtures(
    IReadOnlyList<StateRow> States,
    IReadOnlyList<TransitionRow> Transitions,
    IReadOnlyList<RefusalRow> Refusals,
    IReadOnlyList<TimeInRow> TimeInCases);

public sealed record StateRow(string State, bool Terminal, bool Tracks);

public sealed record TransitionRow(string From, string To);

public sealed record HistoryStep(string State, DateTimeOffset At);

public sealed record RefusalRow(
    string Name,
    IReadOnlyList<HistoryStep> History,
    string To,
    DateTimeOffset At,
    bool Ok,
    string? Reason,
    string? Detail);

public sealed record TimeInRow(string State, int NowMinutes, long Ms);

public sealed record PricingFixtures(
    IReadOnlyList<QuoteRow> Quotes,
    IReadOnlyList<DemurrageRow> Demurrages,
    IReadOnlyList<SettlementRow> Settlements,
    IReadOnlyList<RoundingRow> Roundings,
    IReadOnlyList<ClassingRow> Classing);

public sealed record QuoteRow(
    string Truck,
    string Corridor,
    int Metres,
    long Low,
    long Mid,
    long High,
    bool AtMinimum);

public sealed record DemurrageRow(string Truck, long WaitedMs, int ChargeableHours, long Amount);

public sealed record SettlementRow(
    decimal AgreedNaira,
    decimal DemurrageNaira,
    decimal AdvanceNaira,
    long Agreed,
    long Demurrage,
    long Gross,
    long Commission,
    long Advance,
    long ToCarrier);

public sealed record RoundingRow(long Amount, int Pct, long Result);

public sealed record ClassingRow(decimal Weight, string? Truck);

public sealed record TrackingFixtures(
    IReadOnlyList<DistanceRow> Distances,
    IReadOnlyList<TrackRow> Tracks,
    IReadOnlyList<ObservationRow> Observations);

public sealed record DistanceRow(string From, string To, long Metres);

public sealed record FixRow(double Lat, double Lon, double Accuracy, DateTimeOffset At);

public sealed record TrackRow(
    string Name,
    IReadOnlyList<FixRow> Fixes,
    int Kept,
    IReadOnlyList<string> Dropped,
    double Quality,
    long DistanceMetres);

public sealed record ObservationRow(
    string Name,
    IReadOnlyList<FixRow> Fixes,
    DateTimeOffset Now,
    bool AtWaypoint,
    string Observation,
    long? SilentForMs);
