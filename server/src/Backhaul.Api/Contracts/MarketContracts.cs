using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

/// <summary>A load somebody wants moved.</summary>
public sealed class LoadRequest
{
    [Required]
    [MaxLength(80)]
    public string OriginName { get; set; } = string.Empty;

    [Required]
    [MaxLength(80)]
    public string DestinationName { get; set; } = string.Empty;

    [Range(-90, 90)]
    public double OriginLat { get; set; }

    [Range(-180, 180)]
    public double OriginLon { get; set; }

    [Range(-90, 90)]
    public double DestinationLat { get; set; }

    [Range(-180, 180)]
    public double DestinationLon { get; set; }

    [Required]
    [MaxLength(120)]
    public string Cargo { get; set; } = string.Empty;

    [Range(0.1, 60)]
    public double WeightTonnes { get; set; }

    /// <example>trailer_30t</example>
    [Required]
    [RegularExpression("^(pickup|canter|truck_15t|trailer_30t|lowbed)$")]
    public string Requires { get; set; } = string.Empty;

    /// <summary>What is offered, or null to open it to bids.</summary>
    public long? OfferedKobo { get; set; }

    /// <summary>
    /// The lowest tier a carrier may bid from: unverified, verified, business
    /// or trusted. Omit for no bar.
    /// </summary>
    /// <remarks>
    /// Enforced when a bid is placed, from a tier computed there and then out
    /// of the carrier's reviewed papers and counted record — never read from
    /// the bidder's request. The board greys what a carrier cannot take, and
    /// the greying is a courtesy; this is the rule. See ADR-0017.
    /// </remarks>
    /// <example>verified</example>
    [RegularExpression("^(unverified|verified|business|trusted)$")]
    public string? RequiresTier { get; set; }

    [Required]
    public DateTimeOffset ReadyBy { get; set; }

    [Required]
    public DateTimeOffset ExpiresAt { get; set; }
}

/// <summary>
/// A load on the board.
/// </summary>
/// <remarks>
/// The coordinates travel. "Going your way" is a claim about where a load
/// starts and ends, and a client that cannot place one is a client that cannot
/// price the haul, draw it, or say how far the empty run to reach it is — the
/// three things this board exists to answer. They are the same coordinates the
/// ranking used, so a carrier can check the ranking's arithmetic rather than
/// take it on faith.
/// </remarks>
public sealed record LoadResponse(
    Guid Id,
    string OriginName,
    string DestinationName,
    double OriginLat,
    double OriginLon,
    double DestinationLat,
    double DestinationLon,
    string Cargo,
    double WeightTonnes,
    string Requires,
    long? OfferedKobo,
    string? OfferedNaira,
    DateTimeOffset ReadyBy,
    DateTimeOffset ExpiresAt,
    bool Awarded);

/// <summary>A load with its place in one carrier's ranking.</summary>
public sealed record RankedLoadResponse(
    LoadResponse Load,
    int ScorePct,
    string? Blocked,
    int DeadheadKm,
    int ProgressHomeKm,
    string Because,
    // Whether there was a position to rank from.
    //
    // False when the caller gave no coordinates and nothing has ever reported
    // on their trips. The distances are then zero because nothing was
    // measured, not because the truck is at the pickup — and a screen that
    // cannot tell those apart tells a carrier they have no empty running to do.
    bool Ranked);

public sealed class BidRequest
{
    [Range(1, long.MaxValue)]
    public long AmountKobo { get; set; }

    [Range(-90, 90)]
    public double AtLat { get; set; }

    [Range(-180, 180)]
    public double AtLon { get; set; }
}

public sealed record BidResponse(
    Guid Id,
    long AmountKobo,
    string AmountNaira,
    int TripsCompleted,
    DateTimeOffset PlacedAt);

/// <summary>A bid with its place in the shipper's ranking.</summary>
public sealed record RankedBidResponse(
    BidResponse Bid,
    int ScorePct,
    int? ReliabilityPct,
    int KmToPickup,
    string Because);

public sealed record ChainLegResponse(
    Guid LoadId,
    string FromName,
    string ToName,
    DateTimeOffset ReadyFrom,
    DateTimeOffset? DeliverBy,
    long PaysKobo,
    string PaysNaira,
    int DistanceKm);

/// <summary>Three loads instead of one, and the empty legs between them.</summary>
public sealed record ChainResponse(
    IReadOnlyList<ChainLegResponse> Legs,
    int DeadheadKm,
    int LadenKm,
    long PaysKobo,
    string PaysNaira,
    int LadenPct);

/// <summary>A load that could not join the chain, and which of the two things is wrong.</summary>
public sealed record ChainRefusalResponse(Guid LoadId, string Reason, string Detail);

public sealed record PairingResponse(
    LoadResponse A,
    LoadResponse B,
    int FillPct,
    long PaysAKobo,
    string PaysANaira,
    long PaysBKobo,
    string PaysBNaira,
    long CarrierGetsKobo,
    string CarrierGetsNaira);

/// <summary>Two loads that will not share a truck, and which of the five things is wrong.</summary>
public sealed record PairRefusalResponse(
    LoadResponse A,
    LoadResponse B,
    string Reason,
    string Detail);

/// <summary>What an accepted bid produced.</summary>
/// <remarks>
/// Awarding opens the trip in the same transaction, and its id is derived from
/// the load's so a retry cannot mint a second one. See ADR-0019.
/// </remarks>
public sealed class AwardResponse
{
    public Guid TripId { get; set; }
}
