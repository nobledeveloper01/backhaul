using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>What was captured at the handover.</summary>
/// <remarks>
/// One per trip. Not append-only like the trip history — a driver adds a
/// second photograph and a signature over the course of a few minutes at a
/// gate, and versioning that would produce four "deliveries" for one handover.
/// What is fixed is <see cref="SealedAt"/>: once set, nothing else changes.
/// </remarks>
public sealed class DeliveryEntity
{
    public Guid TripId { get; set; }

    public DateTimeOffset At { get; set; }

    /// <summary>Comma-separated blob ids. The API never looks inside one.</summary>
    [MaxLength(500)]
    public string PhotoIds { get; set; } = string.Empty;

    [MaxLength(80)]
    public string? SignatureName { get; set; }

    [MaxLength(40)]
    public string? SignatureRole { get; set; }

    [MaxLength(64)]
    public string? SignatureImageId { get; set; }

    /// <summary>Where the phone was. Null when there was no fix.</summary>
    public double? CapturedLat { get; set; }

    public double? CapturedLon { get; set; }

    public double? CapturedAccuracy { get; set; }

    [MaxLength(500)]
    public string Note { get; set; } = string.Empty;

    /// <summary>short, damaged or refused.</summary>
    [MaxLength(16)]
    public string? ExceptionKind { get; set; }

    public int? ExceptionQuantity { get; set; }

    [MaxLength(500)]
    public string? ExceptionNote { get; set; }

    /// <summary>
    /// When it became proof.
    /// </summary>
    /// <remarks>
    /// Set once, by the seal endpoint, and never again. Before it, this row is
    /// a draft a driver is filling in at a gate; after it, it is evidence.
    /// </remarks>
    public DateTimeOffset? SealedAt { get; set; }
}

/// <summary>One delivery on a multi-drop trip.</summary>
public sealed class DropEntity
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    [MaxLength(80)]
    public string Consignee { get; set; } = string.Empty;

    [MaxLength(120)]
    public string Goods { get; set; } = string.Empty;

    public int? Units { get; set; }

    public double WeightKg { get; set; }

    /// <summary>
    /// The order the trailer was loaded in.
    /// </summary>
    /// <remarks>
    /// The last drop is at the front of the box, so this is the order it can
    /// be unloaded in. A route that reorders them requires emptying the whole
    /// thing at the first stop.
    /// </remarks>
    public int Sequence { get; set; }

    public DateTimeOffset? DeliveredAt { get; set; }

    [MaxLength(120)]
    public string? Exception { get; set; }
}

/// <summary>What a driver paid on the road.</summary>
/// <remarks>
/// A ledger, not a judgement. Nothing here decides whether a payment should
/// have been made — and recording it is what makes a driver's reimbursement
/// arguable from evidence rather than from memory.
/// </remarks>
public sealed class LevyEntity
{
    /// <summary>Client-generated, so a retry from a checkpoint is a no-op.</summary>
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    /// <summary>police, state_revenue, union, weighbridge, park, ferry, other.</summary>
    [MaxLength(20)]
    public string Kind { get; set; } = string.Empty;

    public long AmountKobo { get; set; }

    public DateTimeOffset At { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    [MaxLength(200)]
    public string Note { get; set; } = string.Empty;

    [MaxLength(64)]
    public string? PhotoId { get; set; }
}
