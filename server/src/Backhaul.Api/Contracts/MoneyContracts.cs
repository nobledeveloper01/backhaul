namespace Backhaul.Api.Contracts;

/// <summary>What a trip was agreed for.</summary>
public sealed record TermsRequest(
    string Truck,
    long AgreedKobo,
    DateTimeOffset AcceptedAt,
    double DistanceM,
    long DriverPayKobo,
    long DriverAdvanceKobo,
    DateTimeOffset? DriverPaidAt,
    // When the shipper was promised it, or null if nobody said. The only thing
    // a carrier's punctuality is measured against, and optional because a trip
    // that is tracked and not traded has no promise on it.
    DateTimeOffset? DeliverBy);

public sealed record TermsResponse(
    string Truck,
    long AgreedKobo,
    string AgreedNaira,
    DateTimeOffset AcceptedAt,
    double DistanceM,
    long DriverPayKobo,
    long DriverAdvanceKobo,
    DateTimeOffset? DriverPaidAt,
    DateTimeOffset? DeliverBy);

public sealed record ReleaseResponse(
    string Kind,
    int Pct,
    string Condition,
    long AmountKobo,
    string AmountNaira,
    bool Met);

/// <summary>
/// The whole release schedule, met and unmet.
/// </summary>
/// <remarks>
/// Every milestone, not only the ones that have been released. A schedule that
/// showed only what has been paid answers "how much have I had" and never
/// "when do I get the rest", which is the question a carrier is asking.
/// </remarks>
public sealed record EscrowResponse(
    long AgreedKobo,
    string AgreedNaira,
    long ReleasedKobo,
    string ReleasedNaira,
    long HeldBackKobo,
    string HeldBackNaira,
    string? NextKind,
    string? NextCondition,
    IReadOnlyList<ReleaseResponse> Releases);

/// <summary>What calling a trip off costs, or why it cannot be done.</summary>
public sealed record CancellationResponse(
    bool Ok,
    string? Reason,
    int? FeePct,
    long? FeeKobo,
    string? FeeNaira,
    bool? WithinGrace,
    string Detail,
    bool CountsAgainstRecord);

public sealed record CostsResponse(
    string Truck,
    double LadenM,
    double EmptyM,
    int Litres,
    long FuelKobo,
    long RunningKobo,
    long LeviesKobo,
    long OtherKobo,
    long TotalKobo,
    string TotalNaira,
    long WalkAwayBelowKobo,
    string WalkAwayBelowNaira,
    MarginResponse? Margin);

public sealed record MarginResponse(
    long RevenueKobo,
    long ProfitKobo,
    string ProfitNaira,
    int? FractionPct,
    bool Take,
    string Detail);

public sealed record EarningsResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    int Trips,
    double DistanceM,
    long EarnedKobo,
    string EarnedNaira,
    long OutOfPocketKobo,
    long OutstandingKobo,
    string OutstandingNaira,
    long SettledKobo,
    long? PerKilometreKobo,
    long? LongestWaitMs,
    IReadOnlyList<UnpaidTripResponse> Unpaid);

public sealed record UnpaidTripResponse(
    Guid TripId,
    string Corridor,
    DateTimeOffset DeliveredAt,
    long PayKobo,
    string PayNaira);
