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
    TrackingFixtures Tracking,
    AuthFixtures Auth,
    WaypointFixtures Waypoints,
    IReadOnlyList<IncidentRow> Incidents,
    PodFixtures Pod,
    DropFixtures Drops,
    TrustFixtures Trust,
    IReadOnlyList<VehicleRow> Vehicles,
    EscrowFixtures Escrow,
    CancellationFixtures Cancellation,
    CostFixtures Costs,
    EarningsFixtures Earnings,
    MatchingFixtures Matching,
    ChainingFixtures Chaining,
    ConsolidationFixtures Consolidation,
    DeviationFixtures Deviation,
    RatingFixtures Ratings,
    LaneFixtures Lanes,
    UtilisationFixtures Utilisation,
    AlertFixtures Alerts,
    SearchFixtures Search,
    DisputeFixtures Dispute);

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

public sealed record StateRow(string State, bool Terminal, bool Tracks, bool SystemRaised);

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

public sealed record AuthFixtures(
    IReadOnlyList<PhoneRow> Phones,
    IReadOnlyList<CodeRow> Codes);

public sealed record PhoneRow(string Written, string? Normalised, string? Formatted);

public sealed record WaypointFixtures(double MinimumRadiusM, IReadOnlyList<WaypointCase> Cases);

public sealed record WaypointCase(
    string Name,
    IReadOnlyList<FixRow> Fixes,
    IReadOnlyList<VisitRow> Visits,
    long ChargeableWaitingMs);

public sealed record VisitRow(
    string Waypoint,
    DateTimeOffset Arrived,
    DateTimeOffset? Left,
    long DurationMs,
    int Fixes);

public sealed record IncidentRow(
    string Kind,
    string Severity,
    bool RaisesDispute,
    bool NeedsPhoto);

public sealed record PodFixtures(
    int MinimumPhotos,
    IReadOnlyList<PodRow> Cases,
    IReadOnlyList<ExceptionRow> Exceptions);

public sealed record PodRow(
    string Name,
    int Photos,
    bool HasSignature,
    string? SignatureName,
    bool Ok,
    string? Reason,
    string? Detail);

public sealed record ExceptionRow(string Kind, bool Settles);

public sealed record DropFixtures(long PerDropKobo, IReadOnlyList<DropFeeRow> Fees);

public sealed record DropFeeRow(int Drops, long FeeKobo);

public sealed record TrustFixtures(
    int ExpiryWarningDays,
    int MinimumTripsForRate,
    IReadOnlyList<TrustRow> Cases);

public sealed record TrustRow(
    string Name,
    DocumentsRow Documents,
    RecordRow Record,
    string Tier,
    double? OnTimeRate);

public sealed record DocumentsRow(
    bool Identity,
    bool Licence,
    bool Registration,
    bool Insurance);

public sealed record RecordRow(
    int TripsCompleted,
    int TripsPromised,
    int TripsOnTime,
    int Incidents);

public sealed record VehicleRow(
    string Name,
    Dictionary<string, int> Days,
    DateTimeOffset Now,
    string Standing,
    IReadOnlyList<PaperDaysRow> Lapsed,
    IReadOnlyList<PaperDaysRow> Expiring,
    IReadOnlyList<string> Missing,
    bool MayCarry);

public sealed record PaperDaysRow(string Paper, int Days);

public sealed record CodeRow(
    string Name,
    bool Present,
    int Attempts,
    DateTimeOffset? ExpiresAt,
    bool Consumed,
    bool Matches,
    DateTimeOffset Now,
    bool Ok,
    string? Reason,
    string? Detail);

public sealed record EscrowFixtures(
    int RetentionDays,
    long InTransitMs,
    bool SumsTo100,
    IReadOnlyList<MilestoneRow> Schedule,
    long AgreedKobo,
    DateTimeOffset NowIso,
    IReadOnlyList<EscrowRow> Cases);

public sealed record MilestoneRow(string Kind, int Pct, string Condition);

public sealed record EscrowRow(
    string Name,
    string State,
    long MovingForMs,
    bool PodSealed,
    DateTimeOffset? DeliveredAt,
    bool ExceptionRaised,
    IReadOnlyList<ReleaseRow> Releases,
    long ReleasedKobo,
    long HeldBackKobo,
    string? NextKind,
    string? NextCondition);

public sealed record ReleaseRow(string Kind, int Pct, long AmountKobo, bool Met);

public sealed record CancellationFixtures(
    long GraceMs,
    long AgreedKobo,
    DateTimeOffset AcceptedAtIso,
    IReadOnlyList<CancelRow> Cases);

public sealed record CancelRow(
    string Name,
    string By,
    string State,
    int MinutesAfterAccepted,
    bool Ok,
    string? Reason,
    int? FeePct,
    long? FeeKobo,
    bool? WithinGrace,
    string Detail,
    bool CountsAgainstRecord);

public sealed record CostFixtures(
    double EmptyFuelFraction,
    double FloorMargin,
    IReadOnlyList<CostRow> Cases);

public sealed record CostRow(
    string Name,
    string Truck,
    double LadenM,
    double EmptyM,
    long DieselPerLitreKobo,
    long LeviesKobo,
    long OtherKobo,
    int Litres,
    long FuelKobo,
    long RunningKobo,
    long TotalKobo,
    long WalkAwayBelowKobo,
    IReadOnlyList<OfferRow> Offers);

public sealed record OfferRow(
    long OfferedKobo,
    long ProfitKobo,
    int? FractionPct,
    bool Take,
    string Detail);

public sealed record EarningsFixtures(
    int MinimumTripsForPerKm,
    DateTimeOffset NowIso,
    IReadOnlyList<StatementRow> Cases);

public sealed record StatementRow(
    int Trips,
    DateTimeOffset FromIso,
    DateTimeOffset ToIso,
    int CountedTrips,
    double DistanceM,
    long EarnedKobo,
    long OutOfPocketKobo,
    long OutstandingKobo,
    long SettledKobo,
    long? PerKilometreKobo,
    IReadOnlyList<string> UnpaidTripIds,
    long? LongestWaitMs);

public sealed record MatchingFixtures(
    double MaxDeadheadM,
    int MinimumTripsForReliability,
    double PremiumTolerance,
    DateTimeOffset NowIso,
    IReadOnlyList<LoadRow> Loads,
    IReadOnlyList<CarrierRow> Carriers,
    double BidPickupLat,
    double BidPickupLon,
    IReadOnlyList<BidRow> Bids,
    IReadOnlyList<RankedBidRow> RankedBids);

public sealed record LoadRow(
    string Id,
    double OriginLat,
    double OriginLon,
    double DestinationLat,
    double DestinationLon,
    double WeightTonnes,
    string Requires,
    long? OfferedKobo,
    DateTimeOffset ReadyByIso,
    DateTimeOffset ExpiresAtIso);

public sealed record CarrierRow(
    string Name,
    bool HasBase,
    string Truck,
    IReadOnlyList<RankedLoadRow> Ranked);

public sealed record RankedLoadRow(
    string LoadId,
    int ScoreThousandths,
    string? Blocked,
    double DeadheadM,
    double ProgressHomeM,
    string Because);

public sealed record BidRow(
    string Id,
    long AmountKobo,
    int TripsCompleted,
    int TripsPromised,
    int TripsOnTime,
    double AtLat,
    double AtLon);

public sealed record RankedBidRow(
    string BidId,
    int ScoreThousandths,
    int? ReliabilityThousandths,
    int KmToPickup,
    string Because);

public sealed record ChainingFixtures(
    double MaxRepositionM,
    double RepositionSpeedMs,
    long ConnectionSlackMs,
    int MaxChainLegs,
    ChainLegRow Start,
    IReadOnlyList<ChainLegRow> Pool,
    IReadOnlyList<FitRow> Fits,
    BuiltChainRow Built);

public sealed record ChainLegRow(
    string LoadId,
    double FromLat,
    double FromLon,
    double ToLat,
    double ToLon,
    string FromName,
    string ToName,
    DateTimeOffset ReadyFromIso,
    DateTimeOffset? DeliverByIso,
    long PaysKobo,
    double DistanceM);

public sealed record FitRow(string LoadId, bool Ok, string? Reason, string? Detail, double? RepositionM);

public sealed record BuiltChainRow(
    IReadOnlyList<string> LegIds,
    double DeadheadM,
    double LadenM,
    long PaysKobo,
    int LadenFractionThousandths);

public sealed record ConsolidationFixtures(
    double PickupSpreadM,
    double DropSpreadM,
    int MinimumFillThousandths,
    int ShipperDiscountPct,
    IReadOnlyList<PairLoadRow> Loads,
    IReadOnlyList<VerdictRow> Verdicts,
    IReadOnlyList<PairingRow> Pairs);

public sealed record PairLoadRow(
    string Id,
    double WeightKg,
    long OfferedKobo,
    string TruckClass,
    double OriginLat,
    double OriginLon,
    double DestinationLat,
    double DestinationLon,
    DateTimeOffset ReadyFromIso);

public sealed record VerdictRow(
    string A,
    string B,
    bool Ok,
    string? Reason,
    string? Detail,
    int? FillThousandths);

public sealed record PairingRow(
    string A,
    string B,
    int FillThousandths,
    long PaysAKobo,
    long PaysBKobo,
    long CarrierGetsKobo);

public sealed record DisputeFixtures(
    long LateAfterMs,
    long GapMs,
    long MinimumCoveredMs,
    DateTimeOffset AssembledAtIso,
    IReadOnlyList<PackRow> Cases);

public sealed record PackRow(
    string Name,
    IReadOnlyList<EvidenceRow> Items,
    int ItemCount,
    IReadOnlyList<string> Weights,
    Dictionary<string, int> Counts,
    long CoveredMs,
    IReadOnlyList<GapRow> Gaps,
    string Describe,
    bool Thin);

public sealed record GapRow(DateTimeOffset FromIso, DateTimeOffset ToIso, long Ms);

public sealed record EvidenceRow(
    string Kind,
    DateTimeOffset AtIso,
    DateTimeOffset? UntilIso,
    DateTimeOffset? ReceivedAtIso,
    string Summary,
    string Source);

public sealed record DeviationFixtures(
    double DeviationM,
    long WindowMs,
    DateTimeOffset NowIso,
    double DestinationLat,
    double DestinationLon,
    IReadOnlyList<DeviationRow> Cases);

public sealed record DeviationRow(
    string Name,
    IReadOnlyList<DeviationFixRow> Fixes,
    string Kind,
    string? Detail,
    double? FurtherM,
    long? SinceMs);


public sealed record DeviationFixRow(double Lat, double Lon, DateTimeOffset AtIso);

public sealed record RatingFixtures(
    int ReviewWindowDays,
    int MinimumAnswers,
    IReadOnlyList<string> CarrierClaims,
    IReadOnlyList<string> ShipperClaims,
    IReadOnlyList<string> ShipperLabels,
    IReadOnlyList<ReviewRow> Reviews,
    IReadOnlyList<TallyRow> Tallies,
    IReadOnlyList<ReviewWindowRow> Windows);

public sealed record ReviewRow(string TripId, Dictionary<string, bool> Answers);

public sealed record TallyRow(string Claim, int Yes, int Asked, bool WorthShowing, string Label);

public sealed record ReviewWindowRow(int Days, bool Reviewable);

public sealed record LaneFixtures(
    long DueWarningMs,
    int RecentRuns,
    int MinimumRunsForTypical,
    double UnusualFraction,
    DateTimeOffset NowIso,
    IReadOnlyList<LaneRow> Cases);

public sealed record LaneRow(
    string Name,
    string Cadence,
    int Runs,
    long? DueInMs,
    bool Due,
    long? TypicalKobo,
    string DescribeDue,
    string DescribeCadence,
    bool? UnusualAtHalf,
    bool? UnusualAtTenOver);

public sealed record UtilisationFixtures(
    int MinimumLegs,
    IReadOnlyList<UtilisationRow> Cases);

public sealed record UtilisationRow(
    string Name,
    IReadOnlyList<UtilisationLegRow> Legs,
    double AverageLegMetres,
    double LoadedMetres,
    double EmptyMetres,
    double TotalMetres,
    double Ratio,
    long EarnedKobo,
    long PerKmDrivenKobo,
    int LegCount,
    string RatioLabel,
    string RateLabel,
    long? WorthOfOneReturnLegKobo);

public sealed record UtilisationLegRow(double Metres, bool Loaded, long EarnedKobo);

public sealed record AlertFixtures(
    int QuietFromHour,
    int QuietToHour,
    DateTimeOffset NowIso,
    IReadOnlyList<AlertPolicyRow> Policy,
    IReadOnlyList<QuietHourRow> QuietHours,
    IReadOnlyList<AlertDecisionRow> Decisions,
    IReadOnlyList<DigestRow> Digests);

public sealed record AlertPolicyRow(
    string Kind,
    IReadOnlyList<string> To,
    string Urgency,
    long RepeatAfterMs,
    string Describe);

public sealed record QuietHourRow(int Hour, bool Quiet);

public sealed record AlertDecisionRow(
    string Kind,
    string To,
    string When,
    int LocalHour,
    int? SentMinutesAgo,
    bool Send,
    string? Urgency,
    string? Reason);

public sealed record DigestRow(IReadOnlyList<string> Held, string? Digest);

public sealed record SearchFixtures(
    DateTimeOffset NowIso,
    IReadOnlyList<TripSummaryRow> Trips,
    IReadOnlyList<TripFilterRow> TripFilters,
    IReadOnlyList<LoadSummaryRow> Loads,
    IReadOnlyList<LoadFilterRow> LoadFilters);

public sealed record TripSummaryRow(
    string Id,
    string Reference,
    string State,
    string Origin,
    string Destination,
    string Cargo,
    string TruckPlate,
    string DriverName,
    DateTimeOffset StartedAtIso,
    bool HasOpenIncident,
    bool IsLate);

public sealed record TripFilterRow(
    string Name,
    string Text,
    IReadOnlyList<string> States,
    bool OnlyLate,
    bool OnlyWithIncidents,
    DateTimeOffset? SinceIso,
    DateTimeOffset? UntilIso,
    IReadOnlyList<string> Matched,
    bool Filtering,
    string Describe);

public sealed record LoadSummaryRow(
    string Id,
    string Origin,
    string Destination,
    string Cargo,
    double WeightKg,
    long OfferedKobo,
    DateTimeOffset ReadyFromIso,
    string TruckClass,
    string? ShipperTier);

public sealed record LoadFilterRow(
    string Name,
    string Text,
    IReadOnlyList<string> TruckClasses,
    long? MinimumOfferKobo,
    DateTimeOffset? ReadyBeforeIso,
    IReadOnlyList<string> Tiers,
    IReadOnlyList<string> Matched,
    string WhyNothing);
