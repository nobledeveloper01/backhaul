namespace Backhaul.Api.Contracts;

public sealed record EvidenceResponse(
    string Kind,
    DateTimeOffset At,
    DateTimeOffset? Until,
    DateTimeOffset? ReceivedAt,
    string Summary,
    string Source,
    string Weight);

public sealed record GapResponse(DateTimeOffset From, DateTimeOffset To, long Ms);

/// <summary>
/// The bundle a disagreement is argued from.
/// </summary>
/// <remarks>
/// No verdict, no summary, no adjective. The counts and the hours are the
/// whole of it — a platform that adjudicates its own disputes is a platform
/// both sides stop trusting.
/// </remarks>
public sealed record PackResponse(
    Guid TripId,
    DateTimeOffset AssembledAt,
    IReadOnlyList<EvidenceResponse> Items,
    int Measured,
    int Attested,
    int LateAttested,
    long CoveredMs,
    IReadOnlyList<GapResponse> Gaps,
    string Describe,
    bool Thin);
