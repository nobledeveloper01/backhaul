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

    [Required]
    public DateTimeOffset ReadyBy { get; set; }

    [Required]
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed record LoadResponse(
    Guid Id,
    string OriginName,
    string DestinationName,
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
    string Because);

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
