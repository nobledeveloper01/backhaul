using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>
/// A load somebody wants moved.
/// </summary>
/// <remarks>
/// The one table in this product that is deliberately readable by people it
/// does not belong to. A load board that only shows a carrier their own loads
/// is not a load board — so the read path here filters on <em>open and not
/// expired</em> rather than on a principal, and the write path filters on the
/// shipper. See ADR-0008 for why that is stated rather than assumed.
/// </remarks>
public sealed class LoadEntity
{
    /// <summary>Client-generated, so a retry on a bad connection is a no-op.</summary>
    public Guid Id { get; set; }

    public Guid ShipperId { get; set; }

    [MaxLength(80)]
    public string OriginName { get; set; } = string.Empty;

    [MaxLength(80)]
    public string DestinationName { get; set; } = string.Empty;

    public double OriginLat { get; set; }

    public double OriginLon { get; set; }

    public double DestinationLat { get; set; }

    public double DestinationLon { get; set; }

    [MaxLength(120)]
    public string Cargo { get; set; } = string.Empty;

    public double WeightTonnes { get; set; }

    /// <summary>The class the shipper asked for.</summary>
    [MaxLength(16)]
    public string Requires { get; set; } = "trailer_30t";

    /// <summary>What is offered, or null when the load is open to bids.</summary>
    public long? OfferedKobo { get; set; }

    public DateTimeOffset ReadyBy { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Set when a bid is accepted. A taken load leaves the board.</summary>
    public Guid? AwardedToCarrierId { get; set; }

    public DateTimeOffset? AwardedAt { get; set; }
}

/// <summary>One carrier's offer on a load.</summary>
public sealed class BidEntity
{
    public Guid Id { get; set; }

    public Guid LoadId { get; set; }

    public Guid CarrierId { get; set; }

    public long AmountKobo { get; set; }

    /// <summary>Where the truck is when the bid is placed.</summary>
    public double AtLat { get; set; }

    public double AtLon { get; set; }

    public DateTimeOffset PlacedAt { get; set; }

    /// <summary>Withdrawn bids are kept, not deleted — see ADR-0003.</summary>
    public DateTimeOffset? WithdrawnAt { get; set; }
}

/// <summary>
/// One review of one trip, by one side of it.
/// </summary>
/// <remarks>
/// The answers are stored as a comma-separated list of claims answered
/// <em>yes</em> and another of claims answered <em>no</em>, because the third
/// state — unanswered — has to survive the round trip. A boolean column per
/// claim would make "not asked" and "no" the same row, and the whole point of
/// this shape is that they are not the same thing.
/// </remarks>
public sealed class ReviewEntity
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    /// <summary>Who wrote it: shipper or carrier.</summary>
    [MaxLength(10)]
    public string By { get; set; } = string.Empty;

    /// <summary>Whose record it counts towards.</summary>
    public Guid AboutUserId { get; set; }

    /// <summary>Claims answered yes, comma separated.</summary>
    [MaxLength(200)]
    public string Yes { get; set; } = string.Empty;

    /// <summary>Claims answered no, comma separated.</summary>
    [MaxLength(200)]
    public string No { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Note { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }
}
