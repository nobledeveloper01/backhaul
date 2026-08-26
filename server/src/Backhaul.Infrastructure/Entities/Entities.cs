using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>A trip. Its history is the <see cref="Events"/> collection.</summary>
public sealed class TripEntity
{
    public Guid Id { get; set; }

    /// <summary>Who carries it.</summary>
    public Guid DriverId { get; set; }

    /// <summary>Who owns the truck.</summary>
    public Guid CarrierId { get; set; }

    /// <summary>Who owns the goods.</summary>
    public Guid ShipperId { get; set; }

    /// <summary>
    /// Denormalised current state, for the ingest path.
    /// </summary>
    /// <remarks>
    /// The hot path needs a trip's state on every batch and must not pay for
    /// loading its whole history to get it. Written only from the last
    /// appended event, in the same transaction, so it cannot disagree with the
    /// history it is derived from.
    /// </remarks>
    [MaxLength(16)]
    public string State { get; set; } = "open";

    public List<TripEventEntity> Events { get; } = [];
}

/// <summary>One entry in a trip's append-only history.</summary>
/// <remarks>
/// There is no update or delete path onto this table, by design and not by
/// omission: a correction is a new row and the original always survives. See
/// ADR-0003.
/// </remarks>
public sealed class TripEventEntity
{
    public long Id { get; set; }

    public Guid TripId { get; set; }

    /// <summary>Position in the history. Ordered by this, never by timestamp.</summary>
    /// <remarks>
    /// Two events may share an instant — a phone with a coarse clock is not a
    /// corrupted history — so a timestamp is not a total order and sorting by
    /// it would make the history's order depend on the database's tie-break.
    /// </remarks>
    public int Sequence { get; set; }

    [MaxLength(16)]
    public string State { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    [MaxLength(16)]
    public string Actor { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Note { get; set; }

    /// <summary>When the server recorded it, which is not when it happened.</summary>
    /// <remarks>
    /// A trip event is created on a phone that may be offline for days. The
    /// gap between <see cref="At"/> and this is often large and is itself
    /// evidence — it is how you tell a late report from a late delivery.
    /// </remarks>
    public DateTimeOffset RecordedAt { get; set; }
}

/// <summary>A position sample, exactly as the device sent it.</summary>
public sealed class PositionSampleEntity
{
    /// <summary>Client-generated, and the deduplication key.</summary>
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    public double Lat { get; set; }

    public double Lon { get; set; }

    public double Accuracy { get; set; }

    public DateTimeOffset At { get; set; }

    public double? Speed { get; set; }

    public double? Battery { get; set; }

    public DateTimeOffset RecordedAt { get; set; }
}

/// <summary>An acknowledged upload batch.</summary>
/// <remarks>
/// Kept so a device that never received its acknowledgement gets the original
/// outcome back rather than a second write. The row is the acknowledgement.
/// </remarks>
public sealed class IngestBatchEntity
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    public int Accepted { get; set; }

    public int Duplicate { get; set; }

    public DateTimeOffset RecordedAt { get; set; }
}
